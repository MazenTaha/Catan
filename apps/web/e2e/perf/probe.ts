/**
 * In-page frame probe for the 3D walk benchmark. `installProbe` is serialised into the page by
 * Playwright, so it must be self-contained (no imports, no outside references).
 *
 * It wraps the world's per-frame function and records, per frame:
 * - the interval since the previous frame (what the player sees; capped by the display refresh),
 * - main-thread time spent in the frame (game update + three.js command submission),
 * - GPU execution time from `EXT_disjoint_timer_query_webgl2`, split into the shadow-map pass and
 *   the rest of the frame; results are read asynchronously frames later, and every result that
 *   overlaps a disjoint event (clock change, context switch) is dropped,
 * - draw calls and triangles for the shadow pass and the camera pass.
 * Long tasks come from a `longtask` PerformanceObserver. Nothing here waits on the GPU.
 */

export interface FrameRec {
  t: number;
  dt: number;
  cpu: number;
  shadow: boolean;
  calls: number;
  tris: number;
  callsS: number;
  trisS: number;
  /** GPU ms: before the shadow pass, the shadow pass, after it; NaN until read (or if dropped). */
  ga: number;
  gs: number;
  gb: number;
  seg: number;
  /** Renderer resources after the frame: textures, geometries, programs (new ones show first-use uploads). */
  res: [number, number, number];
}

export interface Stats {
  frames: number;
  secs: number;
  fps: number;
  interval: { p50: number; p95: number; p99: number; max: number; over60: number; over120: number; over50ms: number };
  cpu: { p50: number; p95: number; p99: number; max: number };
  gpu: { n: number; dropped: number; p50: number; p95: number; p99: number; mean: number; shadowMean: number; mainMean: number; shadowShare: number } | null;
  calls: { main: number; shadow: number };
  tris: { main: number; shadow: number };
  longTasks: { n: number; ms: number; max: number };
}

export function installProbe(): void {
  type GL = WebGL2RenderingContext;
  type Ext = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
  type Renderer = {
    getContext(): GL;
    info: { render: { calls: number; triangles: number }; memory: Record<string, number>; programs?: unknown[] };
    shadowMap: { enabled: boolean; autoUpdate: boolean; needsUpdate: boolean; render(...a: unknown[]): void };
    getPixelRatio(): number;
  };
  type W = { renderer: Renderer; frame(): void; __probed?: boolean };
  const win = window as unknown as { __world3d: { world: W }; __probe?: unknown; __longTasks?: { t: number; d: number }[] };
  const w = win.__world3d.world;
  if (w.__probed) return;
  w.__probed = true;
  const r = w.renderer;
  const gl = r.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as Ext | null;

  const P = {
    on: false,
    gpu: true,
    seg: 0,
    rec: [] as FrameRec[],
    pending: [] as { f: FrameRec; q: Record<string, WebGLQuery> }[],
    pool: [] as WebGLQuery[],
    dropped: 0,
    hook: null as null | ((now: number) => void),
  };
  const ltasks = (win.__longTasks ??= []);
  if (!(win as { __ltObs?: boolean }).__ltObs) {
    (win as { __ltObs?: boolean }).__ltObs = true;
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => ltasks.push({ t: e.startTime, d: e.duration }))).observe({ type: 'longtask', buffered: false });
    } catch {
      /* not supported */
    }
  }

  let cur: { f: FrameRec; q: Record<string, WebGLQuery> } | null = null;
  let open = false;
  const begin = (slot: string) => {
    if (!ext || !P.gpu || !cur) return;
    const q = P.pool.pop() ?? gl.createQuery()!;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    cur.q[slot] = q;
    open = true;
  };
  const end = () => {
    if (!ext || !open) return;
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    open = false;
  };
  const poll = () => {
    if (!ext) return;
    let n = 0;
    while (P.pending.length) {
      const p = P.pending[0];
      const qs = Object.values(p.q);
      if (!qs.every((q) => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE))) break;
      const ms = (k: string) => (p.q[k] ? Number(gl.getQueryParameter(p.q[k], gl.QUERY_RESULT)) / 1e6 : 0);
      p.f.ga = ms('a');
      p.f.gs = ms('s');
      p.f.gb = ms('b');
      qs.forEach((q) => P.pool.push(q));
      P.pending.shift();
      n++;
    }
    // A disjoint event invalidates every result read since the last check.
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      for (const f of P.rec.slice(-n - 2)) f.ga = f.gs = f.gb = NaN;
      P.dropped += n;
    }
  };

  const proto = Object.getPrototypeOf(w) as W;
  let last = 0;
  w.frame = function (this: W) {
    const t0 = performance.now();
    poll();
    if (!P.on) {
      last = t0;
      proto.frame.call(this);
      return;
    }
    P.hook?.(t0);
    const f: FrameRec = { t: t0, dt: last ? t0 - last : NaN, cpu: 0, shadow: false, calls: 0, tris: 0, callsS: 0, trisS: 0, ga: NaN, gs: NaN, gb: NaN, seg: P.seg, res: [0, 0, 0] };
    cur = { f, q: {} };
    begin('a');
    proto.frame.call(this);
    end();
    f.cpu = performance.now() - t0;
    f.calls = r.info.render.calls - f.callsS;
    f.tris = r.info.render.triangles - f.trisS;
    f.res = [r.info.memory.textures, r.info.memory.geometries, r.info.programs?.length ?? 0];
    P.rec.push(f);
    if (ext && P.gpu) P.pending.push(cur);
    cur = null;
    last = t0;
  };
  const sm = r.shadowMap;
  const shadowRender = sm.render.bind(sm);
  sm.render = (...a: unknown[]) => {
    if (!P.on || !cur || !sm.enabled || (!sm.autoUpdate && !sm.needsUpdate)) return shadowRender(...a);
    end();
    const c0 = r.info.render.calls;
    const t0 = r.info.render.triangles;
    begin('s');
    shadowRender(...a);
    end();
    cur.f.shadow = true;
    cur.f.callsS = r.info.render.calls - c0;
    cur.f.trisS = r.info.render.triangles - t0;
    begin('b');
  };

  const q = (a: number[], p: number) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN);
  const sorted = (a: number[]) => a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  const med = (a: number[]) => q(sorted(a), 0.5);
  const stats = (rec: FrameRec[], t0: number, t1: number): Stats => {
    const dts = sorted(rec.slice(1).map((f) => f.dt));
    const cpu = sorted(rec.map((f) => f.cpu));
    const g = rec.filter((f) => Number.isFinite(f.ga));
    const gt = sorted(g.map((f) => f.ga + f.gs + f.gb));
    const sh = g.filter((f) => f.shadow);
    const lt = ltasks.filter((e) => e.t >= t0 && e.t <= t1);
    const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
    const secs = (t1 - t0) / 1000;
    return {
      frames: rec.length,
      secs,
      fps: rec.length / secs,
      interval: {
        p50: q(dts, 0.5),
        p95: q(dts, 0.95),
        p99: q(dts, 0.99),
        max: dts.at(-1) ?? NaN,
        // Missed frames at 60 and 120 Hz, with a quarter-frame allowance for timing noise.
        over60: dts.filter((x) => x > 16.7 * 1.25).length,
        over120: dts.filter((x) => x > 8.3 * 1.25).length,
        over50ms: dts.filter((x) => x > 50).length,
      },
      cpu: { p50: q(cpu, 0.5), p95: q(cpu, 0.95), p99: q(cpu, 0.99), max: cpu.at(-1) ?? NaN },
      gpu: g.length
        ? {
            n: g.length,
            dropped: rec.length - g.length,
            p50: q(gt, 0.5),
            p95: q(gt, 0.95),
            p99: q(gt, 0.99),
            mean: mean(gt),
            shadowMean: mean(sh.map((f) => f.gs)),
            mainMean: mean(g.map((f) => f.ga + f.gb)),
            shadowShare: sh.length / g.length,
          }
        : null,
      calls: { main: med(rec.map((f) => f.calls)), shadow: med(rec.filter((f) => f.shadow).map((f) => f.callsS)) },
      tris: { main: med(rec.map((f) => f.tris)), shadow: med(rec.filter((f) => f.shadow).map((f) => f.trisS)) },
      longTasks: { n: lt.length, ms: lt.reduce((a, e) => a + e.d, 0), max: Math.max(0, ...lt.map((e) => e.d)) },
    };
  };
  const frames = (n: number) =>
    new Promise<void>((res) => {
      let k = 0;
      const f = () => (++k >= n ? res() : requestAnimationFrame(f));
      requestAnimationFrame(f);
    });

  win.__probe = {
    P,
    stats,
    /** Records for `ms`, then waits for the GPU results to arrive. */
    async sample(ms: number, gpu = true) {
      P.gpu = gpu && !!ext;
      P.rec = [];
      P.dropped = 0;
      const t0 = performance.now();
      P.on = true;
      await new Promise((res) => setTimeout(res, ms));
      P.on = false;
      const t1 = performance.now();
      await frames(8);
      poll();
      return { stats: stats(P.rec, t0, t1), rec: P.rec };
    },
    info() {
      const c = gl.canvas as HTMLCanvasElement;
      return {
        timer: !!ext,
        buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        css: [c.clientWidth, c.clientHeight],
        dpr: devicePixelRatio,
        pixelRatio: r.getPixelRatio(),
        memory: { ...r.info.memory, programs: r.info.programs?.length ?? 0 },
      };
    },
  };
}
