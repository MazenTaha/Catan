/*
 * Screenshots every 2D screen, panel state and dialog of Catan Night at three sizes, for the
 * Hall & Chart migration (before/ and after/). Needs the web app (Vite, default :5188) and,
 * for the online lobby and waiting room, the game server behind Vite's /ws proxy.
 *
 *   node design/hall-chart/capture.cjs design/hall-chart/before [baseUrl] [only-scene,...]
 *
 * Game scenes play a fixed-seed game against bots into the middle game once, then inject that
 * session and force the phase each dialog needs (discard, steal, an incoming offer…).
 */
const { chromium } = require('../../node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(process.argv[2] || 'design/hall-chart/before');
const base = process.argv[3] || 'http://localhost:5188/';
const only = process.argv[4] ? new Set(process.argv[4].split(',')) : null;
const SIZES = [
  { w: 1440, h: 900 },
  { w: 1280, h: 720 },
  { w: 390, h: 844 },
];

const SEATS = [
  { name: 'Mazen', color: 'crimson', sigil: 'skull', kind: 'human' },
  { name: 'Morrow', color: 'frost', sigil: 'moon', kind: 'bot', bot: 'warlord' },
  { name: 'Isolde', color: 'bone', sigil: 'eye', kind: 'bot', bot: 'warlord' },
  { name: 'Vex', color: 'violet', sigil: 'thorn', kind: 'bot', bot: 'archdemon' },
];

/** In the page: the app store and the engine, through Vite's dev module URLs. */
const MODS = `const S = await import('/src/state/store.ts'); const E = await import('/@fs/E:/Catan/packages/engine/src/index.ts');`;

async function fresh(page, settings = {}) {
  await page.goto(base);
  await page.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem('hexfall.settings', JSON.stringify({ muted: true, botSpeed: 'instant', ...s }));
  }, settings);
  await page.goto(base);
  await page.waitForSelector('[data-testid="new-game"]');
}

let midSession = null;
/** A fixed game against bots, played to round 15 on the human's turn (computed once). */
async function midGame(page) {
  if (!midSession) {
    midSession = await page.evaluate(
      new Function(
        'seats',
        `return (async () => { ${MODS}
        const st = S.useStore.getState();
        st.updateSettings({ muted: true, botSpeed: 'instant', rookieTips: false });
        st.startGame({ seed: 'night-market', layout: 'balanced', targetVp: 10, firstPlayer: 0, seats });
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let i = 0; i < 8000; i++) {
          const s = S.useStore.getState(); const g = s.session.state;
          const a = E.activeActor(g);
          if (g.round >= 15 && g.currentPlayer === 0 && a === 0 && g.phase.kind === 'main' && E.handTotal(g.players[0]) >= 5) break;
          if (a === 0) s.dispatch(E.decideAction(g, 'warlord'));
          await sleep(15);
        }
        return JSON.parse(JSON.stringify(S.useStore.getState().session));
      })()`,
      ),
      SEATS,
    );
  }
  await inject(page, midSession);
}

/** Puts a session on the game screen; `patch` edits a copy of its state first. */
async function inject(page, session, patch) {
  await page.evaluate(
    new Function(
      'arg',
      `return (async () => { ${MODS}
      const session = arg.session;
      if (arg.patch) new Function('g', 'session', arg.patch)(session.state, session);
      S.useStore.setState({ screen: 'game', session, mode: null, modal: null, tab: 'build', toast: null, showRollOff: false });
    })()`,
    ),
    { session: JSON.parse(JSON.stringify(session)), patch },
  );
  await page.waitForTimeout(700);
}

const store = (page, body) =>
  page.evaluate(new Function(`return (async () => { ${MODS} const st = S.useStore.getState(); ${body} })()`));

const scenes = [
  ['menu', async (p) => fresh(p)],
  ['menu-settings', async (p) => { await fresh(p); await store(p, `st.openModal('settings')`); }],
  ['menu-rules', async (p) => { await fresh(p); await store(p, `st.openModal('rules')`); }],
  ['menu-character', async (p) => { await fresh(p); await store(p, `st.openModal('character')`); await p.waitForTimeout(1500); }],
  ['menu-kingdom', async (p) => { await fresh(p); await store(p, `st.openModal('kingdom')`); await p.waitForTimeout(1500); }],
  ['play', async (p) => { await fresh(p); await p.click('[data-testid="new-game"]'); }],
  ['host-lobby', async (p) => {
    await fresh(p);
    await p.click('[data-testid="new-game"]');
    await p.click('[data-testid="host"]');
    await p.waitForSelector('[data-testid="room-code"]', { timeout: 6000 }).catch(() => {});
  }],
  ['host-lobby-offline', async (p) => {
    await p.routeWebSocket(/\/ws/, (ws) => ws.close());
    await fresh(p);
    await p.click('[data-testid="new-game"]');
    await p.click('[data-testid="host"]');
    await p.waitForTimeout(2500);
    await p.unrouteAll({ behavior: 'ignoreErrors' });
  }],
  ['join-waiting', async (p, ctx) => {
    const host = await ctx.newPage();
    await fresh(host);
    await host.click('[data-testid="new-game"]');
    await host.click('[data-testid="host"]');
    const code = await host.waitForSelector('[data-testid="room-code"]', { timeout: 6000 }).then((e) => e.textContent()).catch(() => null);
    await fresh(p);
    await p.click('[data-testid="new-game"]');
    if (code) {
      await p.fill('[data-testid="join-code"]', code.trim());
      await p.click('[data-testid="join"]');
      await p.waitForSelector('[data-testid="join-waiting"]', { timeout: 6000 }).catch(() => {});
    }
    p.__extra = host;
  }],
  ['join-error', async (p) => {
    await fresh(p);
    await p.click('[data-testid="new-game"]');
    await p.fill('[data-testid="join-code"]', 'NOPE-00');
    await p.click('[data-testid="join"]');
    await p.waitForTimeout(2500);
  }],
  ['game', async (p) => { await fresh(p); await midGame(p); }],
  ['game-cards', async (p) => {
    await fresh(p); await midGame(p);
    await inject(p, midSession, `g.players[0].omens = [{ type: 'warden', boughtTurn: 0 }, { type: 'decree', boughtTurn: g.turn }, { type: 'relic', boughtTurn: 0 }]; g.players[0].playedOmens = ['warden', 'harvest', 'warden'];`);
    await p.click('[data-testid="tab-cards"]');
  }],
  ['game-card-details', async (p) => {
    await fresh(p); await midGame(p);
    await inject(p, midSession, `g.players[0].omens = [{ type: 'warden', boughtTurn: 0 }];`);
    await p.click('[data-testid="tab-cards"]');
    await p.click('[aria-label="Knight details"]');
  }],
  ['game-trade-bank', async (p) => { await fresh(p); await midGame(p); await p.click('[data-testid="tab-trade"]'); }],
  ['game-trade-players', async (p) => {
    await fresh(p); await midGame(p);
    await p.click('[data-testid="tab-trade"]');
    await p.getByRole('button', { name: 'Players' }).click();
  }],
  ['game-placement', async (p) => { await fresh(p); await midGame(p); await store(p, `st.setMode('causeway')`); }],
  ['game-hex-tooltip', async (p) => { await fresh(p); await midGame(p); await store(p, `st.setHoverHex(4)`); }],
  ['game-toast', async (p) => { await fresh(p); await midGame(p); await store(p, `st.pushToast('Not enough resources for a City', 'bad')`); await p.waitForTimeout(400); }],
  ['game-roll', async (p) => {
    await fresh(p); await midGame(p);
    await store(p, `S.useStore.setState({ fx: { ...st.fx, roll: { seq: 9999, dice: [3, 5], total: 8, player: 1 } } })`);
    await p.waitForTimeout(1300);
  }],
  ['game-roll-phase', async (p) => { await fresh(p); await midGame(p); await inject(p, midSession, `g.phase = { kind: 'roll' };`); }],
  ['game-robber', async (p) => { await fresh(p); await midGame(p); await inject(p, midSession, `g.phase = { kind: 'move-wraith', reason: 'seven', resume: 'main' };`); }],
  ['modal-log', async (p) => { await fresh(p); await midGame(p); await store(p, `st.openModal('log')`); }],
  ['modal-leave', async (p) => { await fresh(p); await midGame(p); await store(p, `st.openModal('confirm-new')`); }],
  ['modal-settings-game', async (p) => { await fresh(p); await midGame(p); await store(p, `st.openModal('settings')`); }],
  ['modal-discard', async (p) => {
    await fresh(p); await midGame(p);
    await inject(p, midSession, `g.players[0].hand = { wood: 2, clay: 1, wool: 3, grain: 2, ore: 1 }; g.phase = { kind: 'discard', pending: [4, 0, 0, 0] };`);
  }],
  ['modal-steal', async (p) => {
    await fresh(p); await midGame(p);
    await inject(p, midSession, `g.phase = { kind: 'steal', candidates: [1, 3], resume: 'main' };`);
  }],
  ['modal-trade-offer', async (p) => {
    await fresh(p); await midGame(p);
    await inject(p, midSession, `g.currentPlayer = 1; g.phase = { kind: 'trade', offer: { id: 77, proposer: 1, targets: [0], give: { wood: 0, clay: 0, wool: 2, grain: 0, ore: 0 }, want: { wood: 0, clay: 0, wool: 0, grain: 0, ore: 1 }, declined: [], counterOf: null } };`);
  }],
  ['modal-trade-counter', async (p) => {
    await fresh(p); await midGame(p);
    await inject(p, midSession, `g.currentPlayer = 1; g.phase = { kind: 'trade', offer: { id: 78, proposer: 1, targets: [0], give: { wood: 0, clay: 0, wool: 2, grain: 0, ore: 0 }, want: { wood: 0, clay: 0, wool: 0, grain: 0, ore: 1 }, declined: [], counterOf: null } };`);
    await p.getByRole('button', { name: 'Counter' }).click();
  }],
  ['game-offer-out', async (p) => {
    await fresh(p); await midGame(p);
    await inject(p, midSession, `g.phase = { kind: 'trade', offer: { id: 79, proposer: 0, targets: [1, 2, 3], give: { wood: 1, clay: 0, wool: 0, grain: 0, ore: 0 }, want: { wood: 0, clay: 0, wool: 0, grain: 1, ore: 0 }, declined: [2], counterOf: null } };`);
    await p.click('[data-testid="tab-trade"]');
  }],
  ['modal-year-of-plenty', async (p) => { await fresh(p); await midGame(p); await store(p, `st.openModal('harvest')`); }],
  ['modal-monopoly', async (p) => { await fresh(p); await midGame(p); await store(p, `st.openModal('tithe')`); }],
  ['modal-man-up', async (p) => {
    await fresh(p); await midGame(p);
    await inject(p, midSession, `session.config.pvp = true; g.config.pvp = true; g.players[1].kind = 'human'; g.players[0].omens = [{ type: 'manup', boughtTurn: 0 }];`);
    await p.click('[data-testid="tab-cards"]');
    await p.getByRole('button', { name: 'Play', exact: true }).click();
  }],
  ['modal-roll-off', async (p) => {
    await fresh(p);
    await store(p, `st.startGame({ seed: 'night-market', layout: 'balanced', targetVp: 10, firstPlayer: 'rolloff', seats: ${JSON.stringify(SEATS)} })`);
    await p.waitForTimeout(2500);
  }],
  ['game-setup', async (p) => {
    await fresh(p, { rookieTips: true });
    await store(p, `st.startGame({ seed: 'night-market', layout: 'balanced', targetVp: 10, firstPlayer: 0, seats: ${JSON.stringify(SEATS)} })`);
    await p.waitForTimeout(800);
  }],
  ['modal-pass-device', async (p) => {
    await fresh(p);
    const seats = [{ ...SEATS[0] }, { ...SEATS[1], kind: 'human' }, SEATS[2], SEATS[3]];
    await store(p, `st.startGame({ seed: 'night-market', layout: 'balanced', targetVp: 10, firstPlayer: 0, seats: ${JSON.stringify(seats)} })`);
    await p.waitForTimeout(800);
  }],
  ['victory', async (p) => {
    await fresh(p); await midGame(p);
    await inject(p, midSession, `g.phase = { kind: 'ended', winner: 0 }; g.winner = 0;`);
    await p.waitForTimeout(3200);
  }],
  ['menu-continue', async (p) => { await fresh(p); await midGame(p); await store(p, `st.go('title')`); await p.waitForTimeout(1200); }],
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const size of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
    for (const [name, run] of scenes) {
      if (only && !only.has(name)) continue;
      const page = await ctx.newPage();
      try {
        await run(page, ctx);
        await page.mouse.move(2, 2);
        await page.waitForTimeout(600);
        const file = path.join(outDir, `${name}@${size.w}x${size.h}.jpg`);
        await page.screenshot({ path: file, type: 'jpeg', quality: 72 });
        console.log('ok  ', path.basename(file));
      } catch (e) {
        console.log('FAIL', name, size.w, String(e).split('\n')[0]);
      }
      if (page.__extra) await page.__extra.close();
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
})();
