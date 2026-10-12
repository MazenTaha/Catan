import { useEffect, useRef } from 'react';

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
}

/**
 * Ambient embers drifting upward (canvas). Capped at `count` particles, paused while the
 * tab is hidden, and disabled entirely under reduced motion.
 */
export function Embers({ count = 40, disabled = false }: { count?: number; disabled?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (disabled) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0;
    let h = 0;
    // Soft glows don't need retina resolution.
    const dpr = 1;
    // One pre-rendered ember sprite, stamped with varying alpha/size (no per-frame gradients).
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 32;
    const sctx = sprite.getContext('2d')!;
    const sg = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    sg.addColorStop(0, 'rgba(255,190,110,1)');
    sg.addColorStop(0.4, 'rgba(224,112,42,0.5)');
    sg.addColorStop(1, 'rgba(224,112,42,0)');
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, 32, 32);
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const spawn = (initial = false): Ember => {
      const max = 6 + Math.random() * 8;
      return {
        x: Math.random() * w,
        y: initial ? Math.random() * h : h + 10,
        vx: (Math.random() - 0.5) * 12,
        vy: -(14 + Math.random() * 26),
        life: initial ? Math.random() * max : 0,
        max,
        r: 0.6 + Math.random() * 1.6,
      };
    };
    const embers: Ember[] = Array.from({ length: count }, () => spawn(true));
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // ~30 fps is plenty for slow drifting embers.
      if (now - last < 32) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        e.life += dt;
        e.x += (e.vx + Math.sin((now / 1000 + i) * 1.3) * 8) * dt;
        e.y += e.vy * dt;
        if (e.life > e.max || e.y < -10) {
          embers[i] = spawn();
          continue;
        }
        const t = e.life / e.max;
        ctx.globalAlpha = Math.sin(Math.PI * t) * 0.85;
        const size = e.r * 8;
        ctx.drawImage(sprite, e.x - size / 2, e.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [count, disabled]);
  if (disabled) return null;
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[5] h-full w-full" aria-hidden />;
}
