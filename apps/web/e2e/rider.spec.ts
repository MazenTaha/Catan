import { expect, test } from '@playwright/test';
import { DEFAULT_LOOK, type Pose } from '@hexfall/net';
import fs from 'node:fs';
import type * as Three from 'three';
import type { Avatar } from '../src/components/world/avatar';
import type { Horse } from '../src/components/world/horse';
import type { RemoteFighter } from '../src/components/world/remote';

interface RemoteInfo {
  seat: number;
  name: string;
  color: string;
  look: typeof DEFAULT_LOOK;
  pose: Pose | null;
}

for (const reduceMotion of [false, true])
  test(`rider grip, cape and equipment stay coherent (${reduceMotion ? 'reduced' : 'full'} motion)`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(
      (reduceMotion) =>
        localStorage.setItem(
          'hexfall.settings',
          JSON.stringify({
            effects: 'full',
            renderScale: 1,
            muted: true,
            rookieTips: false,
            reduceMotion,
          }),
        ),
      reduceMotion,
    );
    await page.goto('/?scene=village');
    await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
    const out = `${process.env.RIDER_OUT ?? 'test-results/rider'}/${reduceMotion ? 'reduced' : 'full'}`;
    fs.mkdirSync(out, { recursive: true });
    const result = await page.evaluate(async (look) => {
      type W = {
        renderer: Three.WebGLRenderer;
        scene: Three.Scene;
        camera: Three.PerspectiveCamera;
        combat: { me: Avatar };
        horses: { horse: Horse }[];
      };
      const w = (window as unknown as { __world3d: { world: W } }).__world3d.world;
      w.renderer.setAnimationLoop(null);
      const url = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .find((n) => /\/three\.js/.test(n))!;
      const T = (await import(/* @vite-ignore */ url)) as typeof Three;
      const avatar = w.combat.me,
        horse = w.horses[0].horse;
      avatar.setLook({ ...look, cape: 2 });
      const scene = new T.Scene();
      scene.background = new T.Color('#b6cbd2');
      scene.environment = w.scene.environment;
      scene.add(new T.HemisphereLight('#fff5dc', '#4d6577', 2));
      const sun = new T.DirectionalLight('#fff1d4', 3);
      sun.position.set(-4, 7, 4);
      scene.add(sun);
      const floor = new T.Mesh(
        new T.PlaneGeometry(20, 20),
        new T.MeshStandardMaterial({ color: '#7a866c', roughness: 1 }),
      );
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor, horse.root, avatar.root);
      horse.grazing = false;
      let maxGrip = 0,
        maxSeat = 0,
        maxReinGap = 0,
        cases = 0;
      const failures: unknown[] = [];
      const render = (riding: boolean) => {
        horse.root.visible = riding;
        w.camera.position.set(riding ? 3 : 2.5, riding ? 3.1 : 1.8, riding ? -4 : 3.7);
        w.camera.lookAt(0, riding ? 1.7 : 0.9, 0);
        w.renderer.render(scene, w.camera);
      };
      const palm = (side: string) =>
        avatar.root.getObjectByName(`ReinGrip${side}`)!.getWorldPosition(new T.Vector3());
      for (const hz of [10, 60, 144])
        for (const speed of [0, 2, 5.5, 12])
          for (const weapon of ['fist', 'sword'] as const)
            for (const block of [false, true])
              for (const age of [0.1, 1])
                for (const heading of [0, 2.6]) {
                  horse.root.position.set(0, 0, 0);
                  horse.root.rotation.set(0.15, heading, 0, 'YXZ');
                  for (let i = 0; i < 18; i++) {
                    horse.update(1 / hz, speed);
                    avatar.root.position.copy(horse.seatPosition);
                    avatar.root.position.y -= avatar.seatHeight;
                    avatar.root.rotation.set(0, heading, 0);
                    avatar.update(1 / hz, {
                      speed,
                      weapon,
                      block,
                      attackAge: age,
                      side: 1,
                      riding: true,
                      crouch: 1,
                      aimTurn: 2.8,
                    });
                    avatar.holdReins(horse);
                  }
                  const targets = horse.reinTargets,
                    left = palm('L'),
                    right = palm('R');
                  const both = weapon === 'fist' && !block && age >= 0.42;
                  const grip = Math.max(
                    left.distanceTo(targets.left),
                    both ? right.distanceTo(targets.right) : 0,
                  );
                  maxGrip = Math.max(maxGrip, grip);
                  if (grip > 0.025) failures.push({ hz, speed, weapon, block, age, heading, grip });
                  const hips = avatar.root
                    .getObjectByName('Hips')!
                    .getWorldPosition(new T.Vector3());
                  maxSeat = Math.max(maxSeat, hips.distanceTo(horse.seatPosition));
                  const held = horse.root.getObjectByName('HeldReins') as Three.Mesh;
                  const pos = held.geometry.attributes.position;
                  for (const [strap, end] of [left, both ? right : left].entries()) {
                    const centre = new T.Vector3();
                    // updateMatrixWorld after the geometry update for a tilted/turned parent.
                    held.updateWorldMatrix(true, false);
                    for (let j = 0; j < 4; j++)
                      centre.add(
                        new T.Vector3().fromBufferAttribute(pos, (strap * 13 + 12) * 4 + j),
                      );
                    centre.multiplyScalar(0.25).applyMatrix4(held.matrixWorld);
                    maxReinGap = Math.max(maxReinGap, centre.distanceTo(end));
                  }
                  if (!held.visible || horse.root.getObjectByName('Horse_Reins')!.visible)
                    throw Error('Held/resting rein visibility did not switch');
                  if (weapon === 'sword' && avatar.shield.parent?.parent?.name !== 'Spine')
                    throw Error('Mounted shield was not stowed');
                  cases++;
                }
      horse.root.rotation.set(0, 0, 0);
      horse.root.position.set(0, 0, 0);
      for (let i = 0; i < 90; i++) {
        horse.update(1 / 60, 0);
        avatar.root.position.copy(horse.seatPosition);
        avatar.root.position.y -= avatar.seatHeight;
        avatar.root.rotation.set(0, 0, 0);
        avatar.update(1 / 60, {
          speed: 0,
          weapon: 'fist',
          block: false,
          attackAge: 2,
          side: 1,
          riding: true,
        });
        avatar.holdReins(horse);
      }
      render(true);
      (window as unknown as { __riderReview: unknown }).__riderReview = {
        w,
        avatar,
        horse,
        render,
        scene,
      };
      return { cases, maxGrip, maxSeat, maxReinGap, failures };
    }, DEFAULT_LOOK);
    await page.screenshot({ path: `${out}/riding.png` });
    const cape = await page.evaluate((look) => {
      const r = (
        window as unknown as {
          __riderReview: { avatar: Avatar; horse: Horse; render(ride: boolean): void };
        }
      ).__riderReview;
      const { avatar, horse } = r;
      horse.holdReins(null);
      avatar.root.position.set(0, 0, 0);
      avatar.root.rotation.set(0, 0, 0);
      let minimum = Infinity,
        maximumDepth = 0,
        maximumWidth = 0,
        maxStep = 0;
      const failures: unknown[] = [];
      let samples = 0;
      for (const variant of [1, 2]) {
        avatar.setLook({ ...look, cape: variant });
        for (const speed of [0, 1.1, 2.4, 6.2])
          for (const weapon of ['fist', 'sword'] as const)
            for (const block of [false, true]) {
              let previous: Float32Array | null = null;
              for (let i = 0; i < 180; i++) {
                const crouch =
                  i < 30
                    ? 0
                    : i < 90
                      ? 1 - Math.exp((-(i - 30) / 60) * 14)
                      : Math.exp((-(i - 90) / 60) * 14);
                avatar.update(1 / 60, {
                  speed,
                  weapon,
                  block,
                  attackAge: 0.2,
                  side: 1,
                  riding: false,
                  crouch,
                  stride: ((i / 60) * speed) / 0.8,
                });
                avatar.root.updateMatrixWorld(true);
                const object = avatar.root.getObjectByName(
                  variant === 1 ? 'CapeShort' : 'CapeLong',
                )!;
                const points: number[] = [];
                let minY = Infinity,
                  minX = Infinity,
                  maxX = -Infinity,
                  minZ = Infinity,
                  maxZ = -Infinity;
                object.traverse((o) => {
                  const m = o as Three.SkinnedMesh;
                  if (!m.isSkinnedMesh) return;
                  for (let j = 0; j < m.geometry.attributes.position.count; j += 3) {
                    const v = avatar.root.position.clone();
                    m.getVertexPosition(j, v).applyMatrix4(m.matrixWorld);
                    minY = Math.min(minY, v.y);
                    minX = Math.min(minX, v.x);
                    maxX = Math.max(maxX, v.x);
                    minZ = Math.min(minZ, v.z);
                    maxZ = Math.max(maxZ, v.z);
                    points.push(v.x, v.y, v.z);
                  }
                });
                // Ignore the intentional first-frame change between independent test poses.
                if (previous && i > 10)
                  for (let j = 0; j < points.length; j += 3)
                    maxStep = Math.max(
                      maxStep,
                      Math.hypot(
                        points[j] - previous[j],
                        points[j + 1] - previous[j + 1],
                        points[j + 2] - previous[j + 2],
                      ),
                    );
                previous = new Float32Array(points);
                minimum = Math.min(minimum, minY);
                maximumDepth = Math.max(maximumDepth, maxZ - minZ);
                maximumWidth = Math.max(maximumWidth, maxX - minX);
                if (minY < -0.01 || maxZ - minZ > 1.5)
                  failures.push({ variant, speed, weapon, block, i, minY, depth: maxZ - minZ });
                samples++;
              }
            }
      }
      avatar.setLook({ ...look, cape: 2 });
      for (let i = 0; i < 60; i++)
        avatar.update(1 / 60, {
          speed: 0,
          weapon: 'fist',
          block: false,
          attackAge: 2,
          side: 1,
          riding: false,
          crouch: 1,
        });
      r.render(false);
      return {
        samples,
        minimum,
        maximumDepth,
        maximumWidth,
        maxStep,
        failures: failures.slice(0, 20),
        restingReins: horse.root.getObjectByName('Horse_Reins')!.visible,
      };
    }, DEFAULT_LOOK);
    await page.screenshot({ path: `${out}/crouch.png` });
    fs.writeFileSync(`${out}/poses.json`, JSON.stringify({ result, cape, errors }, null, 2));
    expect(result.maxGrip).toBeLessThan(0.025);
    expect(result.maxSeat).toBeLessThan(0.005);
    expect(result.maxReinGap).toBeLessThan(0.002);
    expect(cape.minimum).toBeGreaterThan(0.01);
    expect(cape.maximumDepth).toBeLessThan(1.2);
    expect(cape.maximumWidth).toBeLessThan(1.1);
    expect(cape.maxStep).toBeLessThan(0.13);
    expect(cape.restingReins).toBe(true);
    expect(errors).toEqual([]);
  });

test('live controller and online riders keep hold through steering, fighting and dismounting', async ({
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
  const result = await page.evaluate((look) => {
    type W = {
      renderer: Three.WebGLRenderer;
      last: number;
      keys: Set<string>;
      yaw: number;
      mount: number;
      combat: {
        me: Avatar;
        player: Three.Object3D;
        age: number;
        attacking: boolean;
        weapon: string;
        blocking: boolean;
        riding: boolean;
      };
      horses: { horse: Horse; yaw: number }[];
      remotes: Map<number, RemoteFighter>;
      mountHorse(i: number): void;
      frame(): void;
      setArms(armed: boolean, ammo: number): void;
      selectWeapon(weapon: 'fist' | 'sword' | 'revolver'): boolean;
      attack(): boolean;
      stopMovement(): void;
      setRemotes(r: RemoteInfo[]): void;
      groundAt(x: number, z: number): number;
    };
    const w = (window as unknown as { __world3d: { world: W } }).__world3d.world;
    w.renderer.setAnimationLoop(null);
    let clock = performance.now();
    const originalNow = performance.now.bind(performance);
    Object.defineProperty(performance, 'now', { configurable: true, value: () => clock });
    w.last = clock;
    w.renderer.render = () => {};
    const advance = () => {
      clock += 1000 / 60;
      w.frame();
    };
    let grip = 0,
      bodyTurn = 0,
      remoteGrip = 0;
    try {
      w.mountHorse(0);
      w.setArms(true, 5);
      w.keys.add('KeyW');
      w.keys.add('ShiftLeft');
      for (let i = 0; i < 180; i++) {
        w.yaw += 0.008;
        if (i === 40) {
          w.selectWeapon('sword');
          w.attack();
        }
        if (i === 85) {
          w.selectWeapon('sword');
          w.attack();
        }
        if (i === 130) w.selectWeapon('fist');
        advance();
        const h = w.horses[0];
        const palm = w.combat.me.root
          .getObjectByName('ReinGripL')!
          .getWorldPosition(w.combat.me.root.position.clone());
        grip = Math.max(grip, palm.distanceTo(h.horse.reinTargets.left));
        bodyTurn = Math.max(bodyTurn, Math.abs(w.combat.player.rotation.y - h.yaw));
      }
      w.stopMovement();
      const pose = {
        x: 8,
        y: w.groundAt(8, 8),
        z: 8,
        yaw: 2.5,
        bodyYaw: 0.4,
        speed: 12,
        weapon: 'sword' as const,
        attacks: 2,
        block: true,
        riding: true,
        crouching: true,
      };
      w.setRemotes([{ seat: 1, name: 'Mounted friend', color: '#347dcc', look, pose }]);
      const friend = w.remotes.get(1)!;
      for (let i = 0; i < 120; i++) friend.update(1 / 60, (x, z) => w.groundAt(x, z));
      const palm = friend.avatar.root
        .getObjectByName('ReinGripL')!
        .getWorldPosition(friend.avatar.root.position.clone());
      remoteGrip = palm.distanceTo(friend.horse.reinTargets.left);
      friend.setPose({ ...pose, riding: false, crouching: true, block: false });
      for (let i = 0; i < 60; i++) friend.update(1 / 60, (x, z) => w.groundAt(x, z));
      const restored =
        friend.horse.root.getObjectByName('Horse_Reins')!.visible &&
        !friend.horse.root.getObjectByName('HeldReins')!.visible;
      const shieldRestored = friend.avatar.shield.parent?.parent?.name === 'ForeArmL';
      w.setRemotes([]);
      return { grip, bodyTurn, remoteGrip, restored, shieldRestored };
    } finally {
      Object.defineProperty(performance, 'now', { configurable: true, value: originalNow });
    }
  }, DEFAULT_LOOK);
  expect(result.grip).toBeLessThan(0.025);
  expect(result.bodyTurn).toBeLessThan(0.001);
  expect(result.remoteGrip).toBeLessThan(0.025);
  expect(result.restored).toBe(true);
  expect(result.shieldRestored).toBe(true);
});
