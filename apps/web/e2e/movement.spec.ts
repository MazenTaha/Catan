import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import type { Scene, Mesh, Vector3, Object3D, Raycaster } from 'three';

test.use({ launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] } });

test('terrain contact, horse seat, dismount momentum and lost focus stay stable', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      'hexfall.settings',
      JSON.stringify({
        effects: 'full',
        renderScale: 1,
        muted: true,
        reduceMotion: false,
        rookieTips: false,
      }),
    ),
  );
  await page.goto('/?scene=village');
  await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
  const ground = await page.evaluate(() => {
    // Runtime types stay in the page; import the actual classes without constructing a second world.
    type Internal = {
      groundAt(x: number, z: number): number;
      houseAt(x: number, z: number): unknown;
      deckAt(x: number, z: number): number | null;
      scene: Scene;
    };
    // World internals are deliberately exposed only in dev/benchmark builds.
    const w = (window as unknown as { __world3d: { world: unknown } }).__world3d.world as Internal;
    let max = 0;
    let samples = 0;
    w.scene.traverse((obj) => {
      const m = obj as Mesh;
      if (!m.isMesh || Array.isArray(m.material) || m.material.customProgramCacheKey() !== 'ground')
        return;
      const p = m.geometry.attributes.position;
      const idx = m.geometry.index!;
      for (let i = 0; i < idx.count; i += 291) {
        const a = idx.getX(i),
          b = idx.getX(i + 1),
          c = idx.getX(i + 2);
        const x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3 + m.position.x;
        const z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3 + m.position.z;
        const lx = Math.abs(x - m.position.x),
          lz = Math.abs(z - m.position.z);
        if (lx > Math.sqrt(3) * 7 - 0.02 || lz + lx / Math.sqrt(3) > 13.98) continue;
        const det =
          (p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)) -
          (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a));
        if (Math.abs(det) < 1e-5 || w.houseAt(x, z) || w.deckAt(x, z) !== null) continue;
        const y = (p.getY(a) + p.getY(b) + p.getY(c)) / 3;
        max = Math.max(max, Math.abs(w.groundAt(x, z) - y));
        samples++;
      }
    });
    return { max, samples };
  });
  const ride = await page.evaluate(async () => {
    // Structural probe avoids making private members part of the public game API.
    type V = Vector3;
    type Horse = { root: Object3D; saddleHeight: number; seatPosition: V };
    type Avatar = { root: Object3D };
    const w = (
      window as unknown as {
        __world3d: {
          world: {
            mount: number;
            x: number;
            z: number;
            vx: number;
            vz: number;
            horses: { x: number; z: number; horse: Horse }[];
            combat: { me: Avatar };
            mountHorse(i: number): void;
            dismount(): void;
            groundAt(x: number, z: number): number;
          };
        };
      }
    ).__world3d.world;
    w.mountHorse(0);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const h = w.horses[w.mount];
    const avatar = w.combat.me;
    avatar.root.updateMatrixWorld(true);
    const hips = avatar.root.getObjectByName('Hips')!;
    const hipY = hips.getWorldPosition(avatar.root.position.clone() as V).y;
    const seatGap = hipY - h.horse.seatPosition.y;
    w.vx = 12;
    w.vz = 0;
    w.dismount();
    return { seatGap, exitSpeed: Math.hypot(w.vx, w.vz), mounted: w.mount >= 0 };
  });
  await page.locator('[data-world3d]').focus();
  await page.keyboard.down('w');
  await page.waitForTimeout(250);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const focus = await page.evaluate(() => {
    const w = (
      window as unknown as { __world3d: { world: { keys: Set<string>; vx: number; vz: number } } }
    ).__world3d.world;
    return { held: [...w.keys], speed: Math.hypot(w.vx, w.vz) };
  });
  await page.keyboard.up('w');
  const out = process.env.MOVE_OUT ?? 'test-results/movement';
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(`${out}/contact.json`, JSON.stringify({ ground, ride, focus, errors }, null, 2));
  await page.screenshot({ path: `${out}/walk.png` });
  expect(ground.samples).toBeGreaterThan(100);
  expect(ground.max).toBeLessThan(0.002);
  expect(Math.abs(ride.seatGap)).toBeLessThan(0.04);
  expect(ride.mounted).toBe(false);
  expect(ride.exitSpeed).toBe(0);
  expect(focus.held).toEqual([]);
  expect(focus.speed).toBe(0);
  expect(errors).toEqual([]);
});

test('movement is consistent across frame rates and stable against walls', async ({ page }) => {
  await page.goto('/?scene=village');
  await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
  const result = await page.evaluate(() => {
    interface C {
      ax: number;
      az: number;
      bx: number;
      bz: number;
      r: number;
    }
    interface Grid {
      near(x: number, z: number, r: number, list: C[]): void;
    }
    const w = (
      window as unknown as {
        __world3d: {
          world: {
            x: number;
            z: number;
            yaw: number;
            vx: number;
            vz: number;
            mount: number;
            keys: Set<string>;
            renderer: { setAnimationLoop(cb: null): void };
            grid: Grid;
            pieceGrid: Grid;
            sheep: unknown[];
            horses: { x: number; z: number; yaw: number }[];
            movePlayer(dt: number): void;
            stopMovement(): void;
            tryMove(x: number, z: number): boolean;
            groundAt(x: number, z: number): number;
            isWalkable(x: number, z: number): boolean;
            doorColliders(list: C[]): void;
            blockedAt(x: number, z: number, radius: number): boolean;
            dismount(): boolean;
          };
        };
      }
    ).__world3d.world;
    w.renderer.setAnimationLoop(null);
    const realMove = w.tryMove;
    w.tryMove = (x, z) => {
      w.x = x;
      w.z = z;
      return true;
    };
    const distances = [30, 60, 144].map((hz) => {
      w.stopMovement();
      w.x = w.z = w.yaw = 0;
      w.mount = -1;
      w.keys.add('KeyW');
      for (let i = 0; i < hz; i++) w.movePlayer(1 / hz);
      w.keys.clear();
      for (let i = 0; i < hz; i++) w.movePlayer(1 / hz);
      return Math.hypot(w.x, w.z);
    });
    w.stopMovement();
    w.x = w.z = 0;
    w.yaw = Math.PI / 2;
    w.mount = 0;
    w.horses[0].yaw = 0;
    w.keys.add('KeyW');
    w.keys.add('ShiftLeft');
    let lateral = 0,
      turn = 0;
    for (let i = 0; i < 240; i++) {
      const before = w.horses[0].yaw;
      w.movePlayer(1 / 120);
      const h = w.horses[0];
      lateral = Math.max(lateral, Math.abs(w.vx * Math.cos(h.yaw) - w.vz * Math.sin(h.yaw)));
      turn = Math.max(turn, Math.abs(h.yaw - before));
    }
    w.tryMove = realMove;
    const walls: C[] = [
      { ax: 0, az: -5, bx: 0, bz: 5, r: 0.08 },
      { ax: -5, az: 0, bx: 5, bz: 0, r: 0.08 },
    ];
    w.grid = {
      near: (_x, _z, _r, list) => {
        list.push(...walls);
      },
    };
    w.pieceGrid = { near: () => {} };
    w.sheep = [];
    for (const h of w.horses) {
      h.x = h.z = 1000;
    }
    w.groundAt = () => 0;
    w.isWalkable = () => true;
    w.doorColliders = () => {};
    w.stopMovement();
    w.mount = -1;
    w.x = w.z = -0.7;
    w.yaw = -Math.PI * 0.75;
    w.keys.add('KeyW');
    w.keys.add('ShiftLeft');
    const stopped: [number, number][] = [];
    for (let i = 0; i < 90; i++) {
      w.movePlayer(1 / 30);
      if (i > 30) stopped.push([w.x, w.z]);
    }
    const corner = {
      x: w.x,
      z: w.z,
      jitter: Math.max(...stopped.map((p) => Math.hypot(p[0] - w.x, p[1] - w.z))),
    };
    w.stopMovement();
    w.mount = 0;
    w.x = -2;
    w.z = -2;
    w.yaw = Math.PI;
    w.horses[0].yaw = Math.PI;
    w.keys.add('KeyW');
    w.keys.add('ShiftLeft');
    for (let i = 0; i < 90; i++) w.movePlayer(1 / 30);
    const horseWall = w.z;
    w.blockedAt = () => true;
    const refusedExit = !w.dismount() && w.mount === 0;
    return { distances, lateral, turn, corner, horseWall, refusedExit };
  });
  const out = process.env.MOVE_OUT ?? 'test-results/movement';
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(`${out}/controller.json`, JSON.stringify(result, null, 2));
  expect(Math.max(...result.distances) - Math.min(...result.distances)).toBeLessThan(0.01);
  expect(result.lateral).toBeLessThan(0.001);
  expect(result.turn).toBeLessThan(0.023);
  expect(result.corner.x).toBeLessThanOrEqual(-0.428);
  expect(result.corner.z).toBeLessThanOrEqual(-0.428);
  expect(result.corner.jitter).toBeLessThan(0.002);
  expect(result.horseWall).toBeLessThanOrEqual(-1.1);
  expect(result.refusedExit).toBe(true);
});

test('rider follows the moving saddle and repeated E cannot toggle the mount', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() =>
    localStorage.setItem(
      'hexfall.settings',
      JSON.stringify({
        effects: 'full',
        muted: true,
        reduceMotion: false,
        rookieTips: false,
      }),
    ),
  );
  await page.goto('/?scene=village');
  await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => {
    const d = (
      window as unknown as {
        __world3d: {
          state(): { board: { hexes: { terrain: string; id: number }[] } };
          world: {
            x: number;
            z: number;
            yaw: number;
            goTo(hex: number): void;
            horses: { x: number; z: number; yaw: number }[];
          };
        };
      }
    ).__world3d;
    const h = d.state().board.hexes.find((h) => h.terrain === 'waste')!;
    const w = d.world;
    w.goTo(h.id);
    Object.assign(w.horses[0], { x: w.x, z: w.z, yaw: w.yaw });
  });
  await page.locator('[data-world3d]').focus();
  await page.keyboard.down('e');
  await page.keyboard.down('e');
  await page.keyboard.up('e');
  const mounted = await page.evaluate(
    () =>
      (window as unknown as { __world3d: { world: { riding: boolean } } }).__world3d.world.riding,
  );
  expect(mounted).toBe(true);
  const out = process.env.MOVE_OUT ?? 'test-results/movement';
  fs.mkdirSync(out, { recursive: true });
  await page.evaluate(() => {
    const w = (
      window as unknown as { __world3d: { world: { yaw: number; setHour(h: number): void } } }
    ).__world3d.world;
    w.setHour(13);
    w.yaw += 1;
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/mounted.png` });
  await page.evaluate(() => {
    const w = (
      window as unknown as {
        __world3d: { world: { yaw: number; mount: number; horses: { yaw: number }[] } };
      }
    ).__world3d.world;
    w.yaw = w.horses[w.mount].yaw;
  });
  await page.keyboard.down('w');
  await page.keyboard.down('Shift');
  const contact = await page.evaluate(
    () =>
      new Promise<{ maxGap: number; samples: number }>((resolve) => {
        type V = Vector3;
        const w = (
          window as unknown as {
            __world3d: {
              world: {
                mount: number;
                horses: { horse: { seatPosition: V } }[];
                combat: { me: { root: Object3D } };
              };
            };
          }
        ).__world3d.world;
        let maxGap = 0,
          samples = 0;
        const start = performance.now();
        const tick = () => {
          const root = w.combat.me.root;
          root.updateMatrixWorld(true);
          const hips = root.getObjectByName('Hips')!;
          maxGap = Math.max(
            maxGap,
            Math.abs(
              hips.getWorldPosition(root.position.clone()).y -
                w.horses[w.mount].horse.seatPosition.y,
            ),
          );
          samples++;
          if (performance.now() - start > 1200) resolve({ maxGap, samples });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.keyboard.up('Shift');
  await page.keyboard.up('w');
  await page.screenshot({ path: `${out}/riding.png` });
  fs.writeFileSync(`${out}/riding.json`, JSON.stringify(contact, null, 2));
  expect(contact.samples).toBeGreaterThan(15);
  expect(contact.maxGap).toBeLessThan(0.005);
});

test('shore and dock support matches the visible sand and planks', async ({ page }) => {
  await page.goto('/?scene=village');
  await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
  const result = await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .find((n) => /\/three\.js/.test(n));
    if (!url) throw new Error('The scene did not load its three.js module');
    const lib = (await import(url)) as { Raycaster: typeof Raycaster; Vector3: typeof Vector3 };
    const w = (
      window as unknown as {
        __world3d: {
          world: {
            scene: Scene;
            walkable: { ax: number; az: number; bx: number; bz: number }[];
            groundAt(x: number, z: number): number;
            houseAt(x: number, z: number): unknown;
            deckAt(x: number, z: number): number | null;
            isWalkable(x: number, z: number): boolean;
          };
        };
      }
    ).__world3d.world;
    const sand: Mesh[] = [],
      land: Mesh[] = [],
      docks: Object3D[] = [];
    w.scene.updateMatrixWorld(true);
    w.scene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && m.position.y === -0.32) sand.push(m);
      if (m.isMesh && !Array.isArray(m.material) && m.material.customProgramCacheKey() === 'ground')
        land.push(m);
      if (o.name === 'walkable-dock') docks.push(o);
    });
    const ray = new lib.Raycaster(new lib.Vector3(), new lib.Vector3(0, -1, 0));
    let shoreMax = 0,
      shoreSamples = 0,
      dockMax = 0,
      dockSamples = 0;
    for (const m of sand) {
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 6) {
        const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3 + m.position.x;
        const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3 + m.position.z;
        if (
          !w.isWalkable(x, z) ||
          w.houseAt(x, z) ||
          w.deckAt(x, z) !== null ||
          w.groundAt(x, z) > 0
        )
          continue;
        ray.ray.origin.set(x, 20, z);
        const hit = ray.intersectObjects([...sand, ...land], false)[0];
        if (!hit || !sand.includes(hit.object as Mesh)) continue;
        // Inner rings are covered by land; sample only the exposed outer sand band.
        if (hit.point.y > -0.33) continue;
        shoreMax = Math.max(shoreMax, Math.abs(w.groundAt(x, z) - hit.point.y));
        shoreSamples++;
      }
    }
    for (const d of w.walkable) {
      const x = d.ax + (d.bx - d.ax) * 0.6,
        z = d.az + (d.bz - d.az) * 0.6;
      ray.ray.origin.set(x, 20, z);
      const hit = ray.intersectObjects(docks, true)[0];
      if (!hit) continue;
      dockMax = Math.max(dockMax, Math.abs(w.groundAt(x, z) - hit.point.y));
      dockSamples++;
    }
    return { shoreMax, shoreSamples, dockMax, dockSamples };
  });
  const out = process.env.MOVE_OUT ?? 'test-results/movement';
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(`${out}/shore.json`, JSON.stringify(result, null, 2));
  expect(result.shoreSamples).toBeGreaterThan(10);
  expect(result.shoreMax).toBeLessThan(0.005);
  expect(result.dockSamples).toBeGreaterThan(3);
  expect(result.dockMax).toBeLessThan(0.005);
});
