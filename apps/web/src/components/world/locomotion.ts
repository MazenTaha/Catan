export const WALK_SPEED = 2.4;
export const RUN_SPEED = 6.2;
export const CROUCH_SPEED = 1.1;
export const CROUCH_DROP = 0.42;

/** Stride length follows the knight's leg reach, so the ground does not race past its feet. */
export function walkingGait(speed: number, crouch = 0) {
  const moving = Math.min(1, Math.max(0, speed / WALK_SPEED));
  const run = Math.min(1, Math.max(0, (speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED)));
  const swing = (0.52 * moving + 0.3 * run) * (1 - crouch * 0.35);
  return { moving, run, swing, step: Math.max(0.18, 1.6 * Math.sin(swing) + 0.12 * run) };
}
