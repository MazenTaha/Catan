import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import type { Object3D, PerspectiveCamera } from 'three';
import type { Pose } from '@hexfall/net';

test.use({ launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] } });

interface Probe {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  vx: number;
  vz: number;
  speed: number;
  last: number;
  camera: PerspectiveCamera;
  combat: { me: { root: Object3D }; crouch: number };
  opts: { onStep?(surface: string): void };
  run: { footfall(...args: unknown[]): void };
  goTo(hex: number): void;
  stopMovement(): void;
  groundAt(x: number, z: number): number;
  clearForCombat(x: number, z: number): boolean;
  setHour(h: number): void;
  pose(): Pose;
  mountHorse(i: number): void;
  dismount(): boolean;
}
interface Dev {
  __world3d: { world: Probe; state(): { board: { hexes: { terrain: string; id: number }[] } } };
  __stealth: { start: { x: number; z: number; yaw: number }; steps: number; dust: number };
}

async function pace(page: Page, keys: string[]) {
  await page.evaluate(() => {
    const d = window as unknown as Dev,
      w = d.__world3d.world;
    w.stopMovement();
    Object.assign(w, d.__stealth.start);
    d.__stealth.steps = d.__stealth.dust = 0;
  });
  await page.locator('[data-world3d]').focus();
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(450);
  const result = await page.evaluate(
    () =>
      new Promise<{ speed: number; steps: number; dust: number; crouching: boolean }>((resolve) => {
        const d = window as unknown as Dev,
          w = d.__world3d.world;
        const start = w.last;
        let samples = 0,
          total = 0;
        const frame = () => {
          samples++;
          total += w.speed;
          const elapsed = (w.last - start) / 1000;
          if (elapsed < 0.65) {
            requestAnimationFrame(frame);
            return;
          }
          resolve({
            speed: total / samples,
            steps: d.__stealth.steps,
            dust: d.__stealth.dust,
            crouching: !!w.pose().crouching,
          });
        };
        requestAnimationFrame(frame);
      }),
  );
  for (const key of [...keys].reverse()) await page.keyboard.up(key);
  return result;
}

for (const reduceMotion of [false, true]) {
  test(`weapon slots and silent crouching (${reduceMotion ? 'reduced' : 'full'} motion)`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const out = `${process.env.CONTROL_OUT ?? 'test-results/weapon-crouch'}/${reduceMotion ? 'reduced' : 'full'}`;
    fs.mkdirSync(out, { recursive: true });
    await page.addInitScript(
      (reduce) =>
        localStorage.setItem(
          'hexfall.settings',
          JSON.stringify({
            effects: 'full',
            renderScale: 1,
            muted: true,
            rookieTips: false,
            reduceMotion: reduce,
          }),
        ),
      reduceMotion,
    );
    await page.goto('/?scene=village');
    await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
    const world = page.locator('[data-world3d]');
    await world.focus();
    for (const [key, name] of [
      ['Digit1', 'Bare hands'],
      ['Digit2', 'Sword'],
      ['Numpad1', 'Bare hands'],
      ['Numpad2', 'Sword'],
    ]) {
      await page.keyboard.press(key);
      await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    }
    await page.getByRole('button', { name: /^Bare hands/ }).click();
    await expect(page.getByRole('button', { name: /^Bare hands/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Digit3');
    await expect(page.getByRole('button', { name: /^Bare hands/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: /Revolver/ })).toHaveCount(0);
    await page.keyboard.press('Numpad3');
    await expect(page.getByRole('button', { name: /^Bare hands/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.evaluate(() => (window as unknown as Dev).__world3d.world.setHour(13));
    if (!reduceMotion) {
      await page.screenshot({ path: `${out}/loadout-1440.png` });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.screenshot({ path: `${out}/loadout-1280.png` });
      const canvas = await world.boundingBox(),
        hud = await page.getByTestId('weapon-loadout').boundingBox();
      expect(hud!.x + hud!.width).toBeLessThan(canvas!.x + canvas!.width);
      expect(hud!.y).toBeGreaterThan(canvas!.y);
      const help = await page.locator('.world-help').boundingBox();
      if (help) expect(hud!.y).toBeGreaterThan(help.y + help.height + 4);
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await page.waitForTimeout(600);
    await page.keyboard.press('Digit1');
    await page.evaluate(() => {
      const d = window as unknown as Dev,
        w = d.__world3d.world;
      w.goTo(d.__world3d.state().board.hexes.find((h) => h.terrain === 'waste')!.id);
      const cx = w.x,
        cz = w.z;
      let start: { x: number; z: number; yaw: number } | undefined;
      outer: for (let dx = -6; dx <= 6; dx += 2)
        for (let dz = -6; dz <= 6; dz += 2)
          for (let a = 0; a < 12; a++) {
            const yaw = (a * Math.PI) / 6,
              x = cx + dx,
              z = cz + dz;
            let good = true;
            for (let t = 0; t < 10; t += 0.25) {
              const px = x - Math.sin(yaw) * t,
                pz = z - Math.cos(yaw) * t;
              if (
                !w.clearForCombat(px, pz) ||
                Math.abs(w.groundAt(px, pz) - w.groundAt(x, z)) > 0.22
              ) {
                good = false;
                break;
              }
            }
            if (good) {
              start = { x, z, yaw };
              break outer;
            }
          }
      if (!start) throw Error('No unobstructed test route on the desert');
      d.__stealth = { start, steps: 0, dust: 0 };
      const originalStep = w.opts.onStep,
        originalDust = w.run.footfall.bind(w.run);
      w.opts.onStep = (surface) => {
        d.__stealth.steps++;
        originalStep?.(surface);
      };
      w.run.footfall = (...args) => {
        d.__stealth.dust++;
        originalDust(...args);
      };
      w.stopMovement();
      Object.assign(w, start);
      w.pitch = 0.08;
    });
    const sneak = await pace(page, ['ControlLeft', 'KeyW']);
    const walk = await pace(page, ['KeyW']);
    const sprint = await pace(page, ['ShiftLeft', 'KeyW']);
    const both = await pace(page, ['ControlRight', 'ShiftLeft', 'KeyW']);
    expect(sneak.speed).toBeCloseTo(1.1, 1);
    expect(walk.speed).toBeCloseTo(2.4, 1);
    expect(sprint.speed).toBeCloseTo(6.2, 1);
    expect(both.speed).toBeCloseTo(sneak.speed, 1);
    expect(sneak.steps + sneak.dust + both.steps + both.dust).toBe(0);
    expect(walk.steps).toBeGreaterThan(0);
    expect(sprint.steps).toBeGreaterThan(0);
    // Inspect the real model and camera at rest, including reduced-motion stance changes.
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => {
      const w = (window as unknown as Dev).__world3d.world,
        root = w.combat.me.root;
      root.updateMatrixWorld(true);
      const head = root.getObjectByName('Head')!,
        foot = root.getObjectByName('FootL')!;
      return {
        head: head.getWorldPosition(root.position.clone()).y,
        foot: foot.getWorldPosition(root.position.clone()).y,
        camera: w.camera.position.y,
      };
    });
    await page.keyboard.down('KeyC');
    await expect(page.getByTestId('crouch-status')).toContainText('silent footsteps');
    await page.waitForTimeout(600);
    const crouched = await page.evaluate(() => {
      const w = (window as unknown as Dev).__world3d.world,
        root = w.combat.me.root;
      root.updateMatrixWorld(true);
      return {
        head: root.getObjectByName('Head')!.getWorldPosition(root.position.clone()).y,
        foot: root.getObjectByName('FootL')!.getWorldPosition(root.position.clone()).y,
        camera: w.camera.position.y,
        pose: w.pose(),
      };
    });
    await page.screenshot({ path: `${out}/crouch.png` });
    expect(before.head - crouched.head).toBeGreaterThan(0.3);
    expect(Math.abs(before.foot - crouched.foot)).toBeLessThan(0.07);
    expect(before.camera - crouched.camera).toBeGreaterThan(0.25);
    expect(crouched.pose.crouching).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.keyboard.up('KeyC');
    await expect(page.getByTestId('crouch-status')).toHaveAttribute('data-crouching', 'false');
    // CEF supplies legacy virtual-key codes without KeyboardEvent.code.
    await world.evaluate((el) =>
      el.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Control',
          keyCode: 162,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await expect(page.getByTestId('crouch-status')).toHaveAttribute('data-crouching', 'true');
    await world.evaluate((el) =>
      el.dispatchEvent(
        new KeyboardEvent('keyup', {
          key: 'Control',
          keyCode: 162,
          bubbles: true,
        }),
      ),
    );
    await expect(page.getByTestId('crouch-status')).toHaveAttribute('data-crouching', 'false');
    await page.evaluate(() => (window as unknown as Dev).__world3d.world.mountHorse(0));
    await world.focus();
    await page.keyboard.down('ControlLeft');
    expect(
      await page.evaluate(() => (window as unknown as Dev).__world3d.world.pose().crouching),
    ).toBe(false);
    await page.keyboard.up('ControlLeft');
    fs.writeFileSync(
      `${out}/checks.json`,
      JSON.stringify({ sneak, walk, sprint, both, before, crouched, errors }, null, 2),
    );
    expect(errors).toEqual([]);
  });
}
