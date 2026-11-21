import { describe, expect, it } from 'vitest';
import { cleanPose } from '../index';

describe('crouch presence compatibility', () => {
  it('keeps old clients standing and relays an on-foot crouch', () => {
    expect(cleanPose({ x: 1 })?.crouching).toBe(false);
    expect(cleanPose({ crouching: true, riding: false })?.crouching).toBe(true);
  });
  it('never crouches a mounted avatar', () => {
    expect(cleanPose({ crouching: true, riding: true })?.crouching).toBe(false);
  });
  it('relays body heading separately while keeping the aim used for hits', () => {
    const pose = cleanPose({ yaw: 0.2, bodyYaw: 1.3 });
    expect(pose?.yaw).toBe(0.2);
    expect(pose?.bodyYaw).toBe(1.3);
    expect(cleanPose({ yaw: 0.8 })?.bodyYaw).toBe(0.8);
    expect(cleanPose({ bodyYaw: Infinity })?.bodyYaw).toBe(0);
  });
});
