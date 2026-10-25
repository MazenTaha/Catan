import { useStore } from './store';

const WINDOW_MS = 2000;
const SLOW_FPS = 42;
const SLOW_WINDOWS = 2;

/** While this says so (the 3D walk can still lower its resolution), slow frames don't count. */
let deferLite: () => boolean = () => false;
export function setLiteDeferral(fn: (() => boolean) | null): void {
  deferLite = fn ?? (() => false);
}

/**
 * Graphics "Auto": samples the frame rate while full effects run and, if it stays below
 * ~42 fps for two consecutive 2-second windows (typically a browser without GPU
 * acceleration), switches to lite effects. Stops once lite is on or Auto is not selected,
 * and restarts if the player picks Auto again. In the 3D walk it waits until the walk's own
 * adaptive resolution has reached its lowest step.
 */
export function startFrameWatch(): void {
  if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') return;
  let raf = 0;
  let windowStart = 0;
  let last = 0;
  let frames = 0;
  let slow = 0;

  const watching = () => {
    const s = useStore.getState().settings;
    return s.effects === 'auto' && !s.autoLite;
  };

  const tick = (now: number) => {
    if (!watching()) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
    // Hidden tabs and long stalls (loading, a modal mounting) say nothing about steady frame cost,
    // and the 3D walk tries a lower resolution before anything is switched off.
    if (document.hidden || now - last > 400 || deferLite()) {
      last = now;
      windowStart = now;
      frames = 0;
      return;
    }
    last = now;
    frames++;
    if (now - windowStart < WINDOW_MS) return;
    const fps = (frames * 1000) / (now - windowStart);
    slow = fps < SLOW_FPS ? slow + 1 : 0;
    windowStart = now;
    frames = 0;
    if (slow >= SLOW_WINDOWS) useStore.getState().updateSettings({ autoLite: true });
  };

  const start = () => {
    if (raf || !watching()) return;
    slow = 0;
    last = 0;
    raf = requestAnimationFrame(tick);
  };

  // Give the first screen a moment to settle before judging.
  window.setTimeout(start, 1500);
  useStore.subscribe((s, prev) => {
    if (s.settings.effects !== prev.settings.effects || s.settings.autoLite !== prev.settings.autoLite) start();
  });
}
