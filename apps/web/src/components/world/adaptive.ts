/**
 * Graphics "Auto" for the 3D walk: lowers the render resolution in steps when frames keep
 * missing a 60 Hz deadline, and raises it again once they have been on time for a while.
 * It judges sustained 2-second windows from frame intervals only (no GPU timing in normal
 * use), waits after each change before judging again, and remembers a level that just failed
 * for a while so it can't oscillate between two. The HTML around the canvas is unaffected.
 */
const STEPS = [1, 0.85, 0.7, 0.6, 0.5];
const WINDOW_MS = 2000;
/** A frame later than this missed a 60 Hz deadline (with a quarter frame for timing noise). */
const LATE_MS = 16.7 * 1.25;
/** Intervals this long are stalls (loading, a hidden tab), not steady cost: ignored. */
const STALL_MS = 250;
/** Step down when more than this share of a window's frames are late; two steps past the second. */
const DOWN_SHARE = 0.1;
const DOWN_TWICE_SHARE = 0.4;
/** Step up after this many windows in a row with at most this share of late frames (noise). */
const UP_WINDOWS = 5;
const UP_SHARE = 0.01;
const SETTLE_MS = 2000;
/** How long a level that failed stays off limits. */
const CEILING_MS = 60_000;

export class AdaptiveScale {
  private level = 0;
  private ceiling = 0;
  private ceilingUntil = 0;
  private windowStart = -1;
  private frames = 0;
  private late = 0;
  private goodWindows = 0;
  private settleUntil = 0;

  get scale(): number {
    return STEPS[this.level];
  }

  /** There is still a lower resolution to try. */
  get canDrop(): boolean {
    return this.level < STEPS.length - 1;
  }

  /** Feeds one frame interval; returns true when the scale changed. */
  sample(now: number, interval: number): boolean {
    if (now < this.settleUntil || interval > STALL_MS || interval <= 0) {
      this.windowStart = -1;
      return false;
    }
    if (this.windowStart < 0) {
      this.windowStart = now;
      this.frames = this.late = 0;
      return false;
    }
    this.frames++;
    if (interval > LATE_MS) this.late++;
    if (now - this.windowStart < WINDOW_MS) return false;
    const lateShare = this.late / this.frames;
    this.windowStart = -1;
    if (now > this.ceilingUntil) this.ceiling = 0;
    if (lateShare > DOWN_SHARE && this.canDrop) {
      const next = Math.min(STEPS.length - 1, this.level + (lateShare > DOWN_TWICE_SHARE ? 2 : 1));
      // The level we leave is too much for now: don't come back to it for a while.
      this.ceiling = next;
      this.ceilingUntil = now + CEILING_MS;
      return this.change(next, now);
    }
    this.goodWindows = lateShare <= UP_SHARE ? this.goodWindows + 1 : 0;
    if (this.goodWindows >= UP_WINDOWS && this.level > this.ceiling) return this.change(this.level - 1, now);
    return false;
  }

  private change(level: number, now: number): boolean {
    this.level = level;
    this.goodWindows = 0;
    this.settleUntil = now + SETTLE_MS;
    return true;
  }
}
