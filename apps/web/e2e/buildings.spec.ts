import { expect, test, type Page } from '@playwright/test';

/**
 * The walk's enterable buildings, in the development scenario (`/?scene=village`): seat 0's
 * cottage next to a wheat field. Door hint and E, walking in and out without passing walls,
 * no game shortcut from the door key, ending a turn from indoors, being moved out when the
 * building becomes a city, Esc back to the board, and a graphics switch while inside.
 */

// Lite keeps the WebGL scene quick under software rendering; motion stays on so doors swing.
const SETTINGS = { botSpeed: 'instant', rookieTips: false, muted: true, effects: 'lite' };

interface Probe {
  inside: boolean;
  onFloor: boolean;
  lx: number;
  lz: number;
  y: number;
  door: number;
  target: number;
}

/** Where the walker is relative to the scenario cottage (building-local metres). */
async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    type H = { key: string; x: number; z: number; rot: number; shape: { inside(x: number, z: number): boolean; onFloor(x: number, z: number): boolean }; doors: { t: number; target: number }[] };
    const w = (window as unknown as { __world3d: { world: { homes: H[]; x: number; z: number; camY: number } } }).__world3d.world;
    const h = w.homes.find((x) => x.key === '-2,4')!;
    const dx = w.x - h.x;
    const dz = w.z - h.z;
    const c = Math.cos(h.rot);
    const s = Math.sin(h.rot);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    return { inside: h.shape.inside(lx, lz), onFloor: h.shape.onFloor(lx, lz), lx, lz, y: w.camY, door: h.doors[0].t, target: h.doors[0].target };
  });
}

/** Stands `dz` metres out from the cottage door (local x offset `side`), facing it. */
async function standAtDoor(page: Page, dz: number, side = 0) {
  await page.evaluate(
    ([dz, side]) => {
      type H = { key: string; x: number; z: number; rot: number; doors: { spec: { cx: number; cz: number; nx: number; nz: number } }[] };
      const w = (window as unknown as { __world3d: { world: { homes: H[]; x: number; z: number; yaw: number; pitch: number } } }).__world3d.world;
      const h = w.homes.find((x) => x.key === '-2,4')!;
      const d = h.doors[0].spec;
      const c = Math.cos(h.rot);
      const s = Math.sin(h.rot);
      const tw = (x: number, z: number) => [h.x + x * c + z * s, h.z - x * s + z * c];
      const [cx, cz] = tw(d.cx, d.cz);
      const [ox, oz] = tw(d.cx + d.nx * dz + side, d.cz + d.nz * dz);
      w.x = ox;
      w.z = oz;
      w.yaw = Math.atan2(-(cx - ox), -(cz - oz));
      w.pitch = -0.05;
    },
    [dz, side] as const,
  );
}

const actions = (page: Page) =>
  page.evaluate(() => (window as unknown as { __hexfall: { getState(): { session: { actions: unknown[] } } } }).__hexfall.getState().session.actions.length);

test('3D walk: enter the cottage, use the door, stay inside the walls, and keep playing', async ({ page }) => {
  test.setTimeout(240_000);
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('GL Driver Message')) return;
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript((s) => {
    if (sessionStorage.getItem('bld')) return;
    localStorage.clear();
    localStorage.setItem('hexfall.settings', JSON.stringify(s));
    sessionStorage.setItem('bld', '1');
  }, SETTINGS);

  await page.goto('/?scene=village');
  const world = page.locator('[data-world3d]');
  await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
  await world.focus();

  // The door hint, once the player starts moving (the controls help makes way).
  await standAtDoor(page, 1.7);
  await page.keyboard.press('KeyD');
  await expect(page.getByTestId('world-hint')).toContainText('Open door');

  // E opens the door, and only the door: no game action is taken.
  const before = await actions(page);
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('world-hint')).toContainText('Close door');
  await expect.poll(async () => (await probe(page)).door, { timeout: 10_000 }).toBe(1);
  expect(await actions(page)).toBe(before);

  // Walk in: on the floor, eye 1.7 m above it; keep pushing and the back wall holds.
  await standAtDoor(page, 1.4);
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await probe(page)).inside, { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  let p = await probe(page);
  expect(p.inside, 'still inside after walking into the far wall').toBe(true);
  expect(Math.abs(p.lx)).toBeLessThan(2.1 - 0.3);
  expect(p.lz).toBeGreaterThan(-1.9 + 0.3);
  expect(p.y).toBeGreaterThan(0.3 + 1.6);

  // A turn ends and comes back while the player is indoors: the game carries on around them,
  // and anything it asks of the player (a discard on a 7, a trade offer) shows over the walk.
  await page.keyboard.press('Space');
  for (let i = 0; i < 180 && !(await page.getByTestId('roll').isVisible()); i++) {
    await page.evaluate(() => {
      type A = { player?: number };
      type St = { session: { state: { phase: { kind: string } } }; dispatch(a: A): void };
      const w = window as unknown as { __hexfall: { getState(): St }; __hexfallAI(s: unknown): A };
      const st = w.__hexfall.getState();
      if (!['discard', 'trade'].includes(st.session.state.phase.kind)) return;
      const a = w.__hexfallAI(st.session.state);
      if (a.player === 0) st.dispatch(a);
    });
    await page.waitForTimeout(500);
  }
  await expect(page.getByTestId('roll')).toBeVisible();
  p = await probe(page);
  expect(p.inside, 'still indoors after the other players moved').toBe(true);

  // Turn round and walk back out through the open door.
  await page.evaluate(() => {
    type H = { key: string; x: number; z: number; rot: number; doors: { spec: { cx: number; cz: number; nx: number; nz: number } }[] };
    const w = (window as unknown as { __world3d: { world: { homes: H[]; x: number; z: number; yaw: number } } }).__world3d.world;
    const h = w.homes.find((x) => x.key === '-2,4')!;
    const d = h.doors[0].spec;
    const c = Math.cos(h.rot);
    const s = Math.sin(h.rot);
    // Stand in front of the doorway, inside, facing out.
    const ix = d.cx - d.nx * 1.1;
    const iz = d.cz - d.nz * 1.1;
    w.x = h.x + ix * c + iz * s;
    w.z = h.z - ix * s + iz * c;
    const ox = h.x + (d.cx + d.nx * 3) * c + (d.cz + d.nz * 3) * s;
    const oz = h.z - (d.cx + d.nx * 3) * s + (d.cz + d.nz * 3) * c;
    w.yaw = Math.atan2(-(ox - w.x), -(oz - w.z));
  });
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await probe(page)).onFloor, { timeout: 15_000 }).toBe(false);
  await page.keyboard.up('KeyW');

  // The settlement becomes a city while someone stands in it: they're moved outside the hall.
  await page.evaluate(() => {
    type H = { key: string; x: number; z: number; rot: number };
    type St = { buildings: Record<string, { owner: number; kind: string }> };
    const dev = (window as unknown as { __world3d: { world: { homes: H[]; x: number; z: number; setPieces(s: St): void }; state(): St } }).__world3d;
    const w = dev.world;
    const h = w.homes.find((x) => x.key === '-2,4')!;
    w.x = h.x;
    w.z = h.z;
    const s = dev.state();
    w.setPieces({ ...s, buildings: { ...s.buildings, '-2,4': { ...s.buildings['-2,4'], kind: 'citadel' } } });
  });
  await expect(page.getByTestId('world-notice')).toContainText('stepped outside');
  const out = await page.evaluate(() => {
    type H = { key: string; kind: string; x: number; z: number; rot: number; shape: { onFloor(x: number, z: number): boolean } };
    const w = (window as unknown as { __world3d: { world: { homes: H[]; x: number; z: number } } }).__world3d.world;
    const h = w.homes.find((x) => x.key === '-2,4')!;
    const dx = w.x - h.x;
    const dz = w.z - h.z;
    const c = Math.cos(h.rot);
    const s = Math.sin(h.rot);
    return { kind: h.kind, onFloor: h.shape.onFloor(dx * c - dz * s, dx * s + dz * c) };
  });
  expect(out).toEqual({ kind: 'hall', onFloor: false });

  // Esc goes straight back to the board.
  await world.focus();
  await page.keyboard.press('Escape');
  await expect(world).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'The board' })).toBeVisible();

  // Back in the walk, a graphics switch rebuilds the world on a fresh canvas and it still draws.
  await page.getByRole('button', { name: '3D walk' }).click();
  await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => (window as unknown as { __hexfall: { getState(): { updateSettings(p: object): void } } }).__hexfall.getState().updateSettings({ effects: 'full' }));
  await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('3D view unavailable')).toHaveCount(0);
  await page.waitForTimeout(1000);
  expect(problems, 'no console errors or warnings').toEqual([]);
});
