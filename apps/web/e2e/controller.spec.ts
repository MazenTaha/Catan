import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import type { Object3D, PerspectiveCamera } from 'three';

test.use({ launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] } });

interface Collider {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
  low?: boolean;
}
interface AuditWorld {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  last: number;
  vx: number;
  vz: number;
  speed: number;
  mount: number;
  camY: number;
  cameraDistance: number;
  crouch: number;
  moveFacing: number;
  keys: Set<string>;
  joy: { x: number; y: number };
  camera: PerspectiveCamera;
  renderer: { setAnimationLoop(cb: null): void; render(): void };
  combat: { player: Object3D; me: { root: Object3D }; blocking: boolean };
  run: { reset(): void; phase: number };
  grid: { near(x: number, z: number, r: number, list: Collider[]): void };
  pieceGrid: { near(x: number, z: number, r: number, list: Collider[]): void };
  sheep: unknown[];
  remotes: Map<number, unknown>;
  horses: { x: number; z: number; yaw: number }[];
  frame(): void;
  look(x: number, y: number): void;
  thirdPersonCamera(dt: number): void;
  stopMovement(): void;
  tryMove(x: number, z: number): boolean;
  groundAt(x: number, z: number): number;
  houseAt(x: number, z: number): undefined;
  doorColliders(list: Collider[]): void;
}

test('audit every movement mode, camera contact and stance transition at 10–144 Hz', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.addInitScript(() =>
    localStorage.setItem(
      'hexfall.settings',
      JSON.stringify({
        effects: 'lite',
        muted: true,
        rookieTips: false,
        reduceMotion: false,
      }),
    ),
  );
  await page.goto('/?scene=village');
  await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
  const result = await page.evaluate(() => {
    const w = (window as unknown as { __world3d: { world: AuditWorld } }).__world3d.world;
    w.renderer.setAnimationLoop(null);
    // Exercise the full real controller, animation and camera with reproducible frame timing.
    w.renderer.render = () => {};
    let clock = performance.now();
    const now = performance.now.bind(performance);
    Object.defineProperty(performance, 'now', { configurable: true, value: () => clock });
    w.last = clock;
    let walls: Collider[] = [];
    w.grid = { near: (_x, _z, _r, list) => list.push(...walls) };
    w.pieceGrid = { near: () => {} };
    w.doorColliders = () => {};
    w.groundAt = () => 0;
    w.houseAt = () => undefined;
    w.sheep = [];
    w.remotes.clear();
    w.horses.forEach((h) => {
      h.x = h.z = 1000;
    });
    const realMove = w.tryMove.bind(w);
    const freeMove = (x: number, z: number) => {
      w.x = x;
      w.z = z;
      return true;
    };
    w.tryMove = freeMove;
    const step = (dt: number) => {
      clock += dt * 1000;
      w.frame();
    };
    const reset = () => {
      w.stopMovement();
      walls = [];
      w.tryMove = freeMove;
      w.x = w.z = w.yaw = w.moveFacing = 0;
      w.pitch = -0.08;
      w.mount = -1;
      w.camY = 1.68;
      w.crouch = 0;
      w.cameraDistance = 3.4;
      w.combat.blocking = false;
      w.combat.player.rotation.y = 0;
      w.run.phase = 0;
    };
    try {
      const modes = [
        { mode: 'walk', keys: ['KeyW'], speed: 2.4 },
        { mode: 'sprint', keys: ['KeyW', 'ShiftLeft'], speed: 6.2 },
        { mode: 'crouch', keys: ['KeyW', 'ControlLeft'], speed: 1.1 },
        { mode: 'diagonal', keys: ['KeyW', 'KeyD'], speed: 2.4 },
        { mode: 'backward', keys: ['KeyS'], speed: 2.4 },
        { mode: 'strafe', keys: ['KeyA'], speed: 2.4 },
        { mode: 'right', keys: ['KeyD'], speed: 2.4 },
        { mode: 'forward-left', keys: ['KeyW', 'KeyA'], speed: 2.4 },
        { mode: 'backward-left', keys: ['KeyS', 'KeyA'], speed: 2.4 },
        { mode: 'backward-right', keys: ['KeyS', 'KeyD'], speed: 2.4 },
        { mode: 'arrows', keys: ['ArrowUp'], speed: 2.4 },
        { mode: 'arrow-backward', keys: ['ArrowDown'], speed: 2.4 },
        { mode: 'opposed', keys: ['KeyW', 'KeyS', 'KeyA', 'KeyD'], speed: 0 },
        { mode: 'crouch-sprint', keys: ['KeyW', 'KeyC', 'ShiftRight'], speed: 1.1 },
        { mode: 'guard', keys: ['KeyW', 'ShiftLeft'], speed: 1.5 },
        { mode: 'horse-walk', keys: ['KeyW'], speed: 5.5 },
        { mode: 'horse-sprint', keys: ['KeyW', 'ShiftLeft'], speed: 12 },
      ];
      const travel = [];
      for (const hz of [10, 15, 30, 60, 144])
        for (const m of modes) {
          reset();
          w.combat.blocking = m.mode === 'guard';
          if (m.mode.startsWith('horse')) {
            w.mount = 0;
            w.horses[0].yaw = 0;
          }
          m.keys.forEach((k) => w.keys.add(k));
          for (let i = 0; i < hz * 2; i++) step(1 / hz);
          const x = w.x,
            z = w.z;
          for (let i = 0; i < hz; i++) step(1 / hz);
          travel.push({
            mode: m.mode,
            hz,
            expected: m.speed,
            distance: Math.hypot(w.x - x, w.z - z),
          });
        }
      const idleFacing = [];
      for (const key of ['KeyA', 'KeyD', 'KeyS']) {
        reset();
        w.keys.add(key);
        for (let i = 0; i < 60; i++) step(1 / 60);
        w.keys.clear();
        for (let i = 0; i < 18; i++) step(1 / 60);
        const before = w.combat.player.rotation.y;
        for (let i = 0; i < 60; i++) step(1 / 60);
        idleFacing.push(
          Math.abs(
            Math.atan2(
              Math.sin(w.combat.player.rotation.y - before),
              Math.cos(w.combat.player.rotation.y - before),
            ),
          ),
        );
      }
      reset();
      walls = [{ ax: -10, az: 2, bx: 10, bz: 2, r: 0.05 }];
      w.thirdPersonCamera(1 / 60);
      let previous = w.cameraDistance,
        maxCameraStep = 0;
      for (let i = 0; i < 240; i++) {
        w.yaw = -0.4 + (i / 239) * 0.8;
        w.thirdPersonCamera(1 / 120);
        if (i > 10) maxCameraStep = Math.max(maxCameraStep, Math.abs(w.cameraDistance - previous));
        previous = w.cameraDistance;
      }
      reset();
      w.look(0, -100000);
      const maxPitch = w.pitch;
      w.look(0, 1);
      const upperReversed = maxPitch - w.pitch;
      w.look(0, 100000);
      const minPitch = w.pitch;
      w.look(0, -1);
      const lowerReversed = w.pitch - minPitch;
      reset();
      w.keys.add('KeyW');
      w.keys.add('ShiftLeft');
      for (let i = 0; i < 180; i++) step(1 / 60);
      const cameraHeights = [];
      for (let i = 0; i < 120; i++) {
        step(1 / 60);
        cameraHeights.push(w.camera.position.y);
      }
      reset();
      w.keys.add('KeyW');
      w.keys.add('ControlLeft');
      for (let i = 0; i < 90; i++) step(1 / 60);
      w.keys.delete('ControlLeft');
      const stance = [];
      for (let i = 0; i < 90; i++) {
        step(1 / 60);
        const root = w.combat.me.root;
        root.updateMatrixWorld(true);
        stance.push(
          Math.min(
            ...['FootL', 'FootR'].map(
              (n) => root.getObjectByName(n)!.getWorldPosition(root.position.clone()).y,
            ),
          ),
        );
      }
      reset();
      w.tryMove = realMove;
      walls = [{ ax: 0.6, az: -20, bx: 0.6, bz: 20, r: 0.08 }];
      w.keys.add('KeyW');
      w.keys.add('KeyD');
      for (let i = 0; i < 120; i++) step(1 / 60);
      const contact = [];
      for (let i = 0; i < 120; i++) {
        step(1 / 60);
        contact.push(w.x);
      }
      reset();
      w.keys.add('KeyW');
      w.keys.add('ShiftLeft');
      step(5);
      const stallDistance = Math.hypot(w.x, w.z);
      return {
        travel,
        idleFacing,
        maxCameraStep,
        maxPitch,
        minPitch,
        upperReversed,
        lowerReversed,
        stallDistance,
        sprintCameraBounce: Math.max(...cameraHeights) - Math.min(...cameraHeights),
        stanceHeight: Math.max(...stance),
        stance,
        wallSlideJitter: Math.max(...contact) - Math.min(...contact),
      };
    } finally {
      Object.defineProperty(performance, 'now', { configurable: true, value: now });
    }
  });
  const out = process.env.AUDIT_OUT ?? 'test-results/controller-audit';
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(`${out}/audit.json`, JSON.stringify(result, null, 2));
  for (const p of result.travel)
    expect(p.distance, `${p.mode} at ${p.hz} Hz`).toBeCloseTo(p.expected, 1);
  expect(Math.max(...result.idleFacing)).toBeLessThan(0.05);
  expect(result.maxCameraStep).toBeLessThan(0.03);
  expect(result.maxPitch).toBeLessThanOrEqual(0.55);
  expect(result.minPitch).toBeGreaterThanOrEqual(-0.65);
  expect(result.sprintCameraBounce).toBeLessThan(0.02);
  expect(result.stanceHeight).toBeLessThan(0.14);
  expect(Math.min(...result.stance)).toBeGreaterThan(0.04);
  expect(result.upperReversed).toBeCloseTo(0.004, 5);
  expect(result.lowerReversed).toBeCloseTo(0.004, 5);
  expect(result.stallDistance).toBeLessThan(0.62);
  expect(result.wallSlideJitter).toBeLessThan(0.005);
});

for (const native of [false, true]) {
  test(`mouse capture never doubles look or keeps held movement (${native ? 'Unreal bridge' : 'browser'})`, async ({
    page,
  }) => {
    await page.addInitScript((native) => {
      localStorage.setItem(
        'hexfall.settings',
        JSON.stringify({ effects: 'lite', muted: true, rookieTips: false }),
      );
      if (native) Object.assign(window, { ue: { catanhost: { quit() {}, lockmouse() {} } } });
    }, native);
    await page.goto('/?scene=village');
    await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
    const world = page.locator('[data-world3d]');
    // Start a drag, then capture the mouse before the pointer-up reaches React.
    await page.mouse.move(600, 480);
    await page.mouse.down();
    await page.getByTestId('dive-in').evaluate((button) => (button as HTMLButtonElement).click());
    await expect(page.getByTestId('dive-in')).toHaveAttribute('aria-pressed', 'true');
    const before = await page.evaluate(
      () => (window as unknown as { __world3d: { world: AuditWorld } }).__world3d.world.yaw,
    );
    await world.dispatchEvent('pointermove', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 640,
      clientY: 510,
    });
    const afterDrag = await page.evaluate(
      () => (window as unknown as { __world3d: { world: AuditWorld } }).__world3d.world.yaw,
    );
    expect(afterDrag).toBe(before);
    await page.evaluate((native) => {
      if (native)
        window.dispatchEvent(new CustomEvent('catanhost:look', { detail: { dx: 20, dy: 0 } }));
      else document.dispatchEvent(new MouseEvent('mousemove', { movementX: 20, movementY: 0 }));
    }, native);
    const afterLook = await page.evaluate(
      () => (window as unknown as { __world3d: { world: AuditWorld } }).__world3d.world.yaw,
    );
    expect(Math.abs(afterLook - before)).toBeGreaterThan(0.01);
    await page.mouse.up();
    await world.focus();
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ControlLeft');
    await page.evaluate((native) => {
      const w = (window as unknown as { __world3d: { world: AuditWorld } }).__world3d.world;
      w.joy.x = 1;
      if (native) window.dispatchEvent(new Event('catanhost:unlock'));
      else document.exitPointerLock();
    }, native);
    await expect(page.getByTestId('dive-in')).toHaveAttribute('aria-pressed', 'false');
    const stopped = await page.evaluate(() => {
      const w = (window as unknown as { __world3d: { world: AuditWorld } }).__world3d.world;
      return {
        keys: [...w.keys],
        joy: w.joy,
        speed: Math.hypot(w.vx, w.vz),
        guard: w.combat.blocking,
      };
    });
    expect(stopped).toEqual({ keys: [], joy: { x: 0, y: 0 }, speed: 0, guard: false });
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ControlLeft');
    // Capture release also drops the stale drag, so an unlocked move cannot snap the view.
    const yaw = await page.evaluate(
      () => (window as unknown as { __world3d: { world: AuditWorld } }).__world3d.world.yaw,
    );
    await world.dispatchEvent('pointermove', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 900,
      clientY: 520,
    });
    expect(
      await page.evaluate(
        () => (window as unknown as { __world3d: { world: AuditWorld } }).__world3d.world.yaw,
      ),
    ).toBe(yaw);
  });
}

test('orbit stays outside terrain, cottage walls and ceilings across the live island', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'hexfall.settings',
      JSON.stringify({ effects: 'lite', muted: true, rookieTips: false }),
    ),
  );
  await page.goto('/?scene=village');
  await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
  const result = await page.evaluate(() => {
    type House = { x: number; z: number; y: number; shape: { ceiling: number } };
    type OrbitWorld = Omit<AuditWorld, 'houseAt'> & {
      homes: House[];
      spawns: Map<number, { x: number; z: number }>;
      houseAt(x: number, z: number): House | undefined;
      nearbySolids(x: number, z: number, r: number): Collider[];
      cleared(x: number, z: number): boolean;
      blockedAt(x: number, z: number, r: number): boolean;
      isWalkable(x: number, z: number): boolean;
    };
    const w = (window as unknown as { __world3d: { world: OrbitWorld } }).__world3d.world;
    w.renderer.setAnimationLoop(null);
    w.stopMovement();
    const spots = [...w.spawns.values()].map((p) => ({
      ...p,
      house: undefined as House | undefined,
    }));
    spots.push(...w.homes.map((h) => ({ x: h.x, z: h.z, yaw: 0, house: h })));
    let samples = 0,
      groundGap = Infinity,
      roofOverlap = 0,
      wallOverlap = 0;
    const failures: unknown[] = [];
    for (const p of spots)
      for (const stance of ['stand', 'crouch', 'horse']) {
        if (stance === 'horse' && p.house) continue; // Mounts cannot enter buildings.
        let point: { x: number; z: number } | undefined;
        search: for (const r of [0, 0.6, 1.2, 1.8, 2.4, 3, 4])
          for (let a = 0; a < 16; a++) {
            const x = p.x + Math.sin((a * Math.PI) / 8) * r,
              z = p.z + Math.cos((a * Math.PI) / 8) * r;
            if (!w.isWalkable(x, z) || w.blockedAt(x, z, stance === 'horse' ? 1.1 : 0.35)) continue;
            const house = w.houseAt(x, z);
            if ((p.house && house !== p.house) || (stance === 'horse' && house)) continue;
            point = { x, z };
            break search;
          }
        if (!point) continue;
        w.x = point.x;
        w.z = point.z;
        w.camY = w.groundAt(w.x, w.z) + 1.68;
        w.crouch = stance === 'crouch' ? 1 : 0;
        w.mount = stance === 'horse' ? 0 : -1;
        for (const pitch of [-0.65, -0.08, 0.55])
          for (let a = 0; a < 24; a++) {
            w.yaw = (a * Math.PI) / 12;
            w.pitch = pitch;
            w.cameraDistance = 6;
            w.thirdPersonCamera(1 / 60);
            const c = w.camera.position,
              floor = w.groundAt(c.x, c.z),
              house = w.houseAt(c.x, c.z);
            groundGap = Math.min(groundGap, c.y - floor);
            if (house)
              roofOverlap = Math.max(roofOverlap, c.y - (house.y + house.shape.ceiling - 0.18));
            for (const wall of w.nearbySolids(c.x, c.z, 1)) {
              if (wall.low && c.y - floor > 1.3) continue;
              if (wall.ax === wall.bx && wall.az === wall.bz && w.cleared(wall.ax, wall.az))
                continue;
              const dx = wall.bx - wall.ax,
                dz = wall.bz - wall.az;
              const t = Math.max(
                0,
                Math.min(
                  1,
                  ((c.x - wall.ax) * dx + (c.z - wall.az) * dz) / (dx * dx + dz * dz || 1),
                ),
              );
              const overlap =
                wall.r + 0.14 - Math.hypot(c.x - wall.ax - dx * t, c.z - wall.az - dz * t);
              wallOverlap = Math.max(wallOverlap, overlap);
              if (overlap > 0.001)
                failures.push({
                  p,
                  stance,
                  pitch,
                  yaw: w.yaw,
                  overlap,
                  distance: w.cameraDistance,
                });
            }
            samples++;
          }
      }
    return { samples, groundGap, roofOverlap, wallOverlap, failures };
  });
  const out = process.env.AUDIT_OUT ?? 'test-results/controller-audit';
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(`${out}/orbit.json`, JSON.stringify(result, null, 2));
  expect(result.samples).toBeGreaterThan(1000);
  expect(result.groundGap).toBeGreaterThan(0.18);
  expect(result.roofOverlap).toBeLessThan(0.001);
  expect(result.wallOverlap).toBeLessThan(0.001);
});
