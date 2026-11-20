# Hall & Chart: 2D migration checklist

The inventory of every 2D screen, panel, dialog, overlay and state, from
`design/CATAN_NIGHT_2D_PROMPT.md` and the code. Each line names the files, the Hall & Chart pattern
it maps to, and its status (`[ ]` to do, `[x]` done). Decisions taken along the way are at the end.

Screenshots: `before/` and `after/` hold every scene below at 1440×900, 1280×720 and 390×844, made by
`capture.cjs` (`node design/hall-chart/capture.cjs design/hall-chart/after`, with the web app on
:5188 and the game server running).

## Stack (Phase 0 findings)

- **App:** React 18, Vite 5, Zustand 5, Framer Motion, Tailwind 3. No router: `state/store.ts`
  `screen` (`title` | `setup` | `game`) plus `modal` (settings, rules, character, kingdom, log,
  confirm-new, harvest, tithe).
- **Styles:**
  - `apps/web/src/styles/tokens.css`: RGB-triplet tokens for Tailwind.
  - `apps/web/src/styles/index.css`: `.panel`, `.btn`, `.chip`, `.tile`, `.meter`, `.icon-btn` and
    animation utilities.
  - `tailwind.config.ts`: theme colours and fonts.
- **Fonts:** self-hosted through `@fontsource` (`styles/fonts.ts`).
- **2D code:** `components/screens`, `panels`, `modals`, `hud`, `ui`, `fx`, `board`.
- **3D code:** `components/world/*`.
  - Its HUD (`World3D.tsx`, `Minimap.tsx`, `Preview.tsx`) also uses `.panel`, `.btn` and `.chip`.
  - **Those shared classes stay as they are for the 3D walk**; the 2D UI moves to the new `hc-*`
    kit.
- **Assets:** board and pieces are code-drawn SVG; card illustrations are files in `public/art/cards`.

## Existing art (kept as it is)

| Art | Where |
|---|---|
| Board: terrain, flora, sea, shores, harbors and piers, boats, windmills | `art/terrain/TerrainArt.tsx`, `art/terrain/flora.tsx`, `components/board/Scenery.tsx`, `components/board/BoardDefs.tsx` |
| Pieces, number tokens, robber, harbor plaques | `art/pieces/Pieces.tsx` |
| Board layers, hit layer, ghost previews | `components/board/Board.tsx`, `components/board/WalkLayer.tsx` |
| Resource card art (Lumber, Brick, Wool, Grain, Ore) | `public/art/cards/{wood,clay,wool,grain,ore}.webp` via `art/cards/cardArt.ts` |
| Development card art | `public/art/cards/{warden,relic,decree,harvest,tithe,manup}.webp`, `art/cards/OmenCard.tsx` |
| Player sigils (Skull, Moon, Eye, Thorn) and player discs | `art/pieces/Sigil.tsx` |
| Character and My kingdom 3D previews | `components/world/Preview.tsx` (3D, untouched) |
| Line icons (UI glyphs, not art) | `art/icons/Icon.tsx`. Resource line glyphs get replaced by the card art in the UI. |
| Logo | Text in the Cinzel Decorative font (no image). The new title uses blackletter plus the kit's crest. |
| Audio | `audio/*`, synthesized; untouched. |

**Performance overlay:** the 2D game has no FPS/GPU/CPU/LAT overlay. `state/frameWatch.ts` only
drives Auto graphics, and the 3D walk's numbers come from `pnpm bench`. Frame rate is checked with
`LAG=1 pnpm e2e lag` before and after.

## Old styles to replace (2D only)

- **Classes:** `.panel`, `.panel-title`, `.btn`, `.btn-primary`, `.btn-danger`, `.btn-ghost`,
  `.cream-fill`, `.chip`, `.tile`, `.tile-interactive`, `.tile-selected`, `.meter`, `.icon-btn`,
  `.kbd` and `.divider-ornament` in 2D components.
- **Tailwind:**
  - colours: `bg-surface-*`, `text-gold`, `text-muted`, `text-bone`, `border-iron`, `text-ember`,
    `text-venom`, `text-frost`, `bg-abyss`;
  - fonts: `font-display`, `font-logo`, `font-body`.
- **Hard-coded colours** in 2D components: `#141617`, `#16181a`, `#24160f`, `#2a1406`, `#0f1112`,
  `#8a4318`, `#e0585f` and the radial backdrop gradients in `TitleScreen.tsx`, `GameScreen.tsx`,
  `GameModals.tsx` and `Hud.tsx`.
- **Old body background:** graphite with radial glows, `.vignette` grain, and `Embers` on the title.
- **Old fonts:** Cinzel, Cinzel Decorative, Crimson Pro. They stay installed for the 3D HUD and the
  board's number tokens (board art).

## Phase 1: the kit (`apps/web/src/ui/hall/`, dev page `/#ui-kit`)

| Item | Pattern | Status |
|---|---|---|
| Fonts (UnifrakturCook, IM Fell English SC, IM Fell DW Pica + SC) self-hosted | foundations | [x] |
| Tokens from `tokens.css`, Ember and Frostbound variants | foundations | [x] |
| Textures (stone, parchment, vellum, letter, oak, weave) | foundations | [x] |
| `HallBackground` (stone, vignette, columns, windows, torches, war table) | Royal Court | [x] |
| `ParchmentSheet`, `ChartSheet` (rolled ends, neat line, ticks), `OakPanel` (iron corners, brass plate) | surfaces | [x] |
| `Banner` (all 11 layers, states) and `BannerPole` (rings on the rod's centre line) | banners | [x] |
| Buttons: primary, dark, brass plaque, iron plaque, round brass icon, paper, wax seal | controls | [x] |
| Check box, segmented, select, text input, stepper, range | parchment controls | [x] |
| Panel tabs (red underline); banner tabs on a pole | tabs | [x] |
| Scale-bar meter (`role="meter"`) | Sea Chart | [x] |
| Map-note tooltip with leader line | Sea Chart | [x] |
| Herald's slip toast | Royal Court | [x] |
| Decree dialog (focus trap, Esc, dismissable flag, 55% stone backdrop) | Royal Court | [x] |
| Bone dice | Royal Court | [x] |
| Arms (heater shield: player colour, gold rim, sigil charge) | heraldry | [x] |
| Resource art (cropped card art at small sizes) | art | [x] |
| Iron connection plaque; loading (torch or hourglass) | Royal Court | [x] |
| `/#ui-kit` dev page with every component and state | — | [x] |

## Phase 2: screens

### Title (`screens/TitleScreen.tsx`, `App.tsx`)

| Item | Pattern | Status |
|---|---|---|
| Hall: stone, columns, night windows, torches | HallBackground | [x] |
| Title "Catan + crest + Night", ribbon "Trade · Build · Settle" | blackletter, ribbon | [x] |
| Menu banners on one pole, symmetric, Play lit; Continue only with a save (skyline rule) | Banner | [x] |
| Rejoin as a sealed letter "A summons: room <code> awaits" (+ "Rejoining…" / error) | ParchmentSheet + wax seal | [x] |
| Quit (native host only) iron plaque; sound brass button | plaques | [x] |
| Profile plaque bottom-left (arms, name, blazon), opens Character | OakPanel | [x] |
| War table with the real board on a vellum chart in perspective | ChartSheet | [x] |

### Play (`screens/NewGameScreen.tsx`)

| Item | Pattern | Status |
|---|---|---|
| Header: "The hall" brass back plaque, blackletter title, Host / Join buttons | plaques | [x] |
| Choose view: profile (name, colour radio, sigil radio) + live arms banner | parchment controls, Banner | [x] |
| Choose view: Host card, Join form (code input, Join) | ParchmentSheet | [x] |
| Host: invite letter, all states (Opening a room…, code + Copy code/Copied, Playing on this device) | letter of summons | [x] |
| Host: seat banners on a pole; Seat kicker, arms or empty shield, status gloss, host crown | Banner | [x] |
| Host: per-seat Invite / Bot / This device segmented + bot difficulty + Remove + local name input | OakPanel + seg | [x] |
| Host: 3 / 4 players | seg | [x] |
| Host: Articles of the Game (Victory at, First player, layout, seed + reroll, preview) | OakPanel | [x] |
| Host: start problem strip, Fill empty seats with bots, Start game (disabled reasons) | buttons | [x] |
| Join: Finding the table…, failure decree + Try another code | decree | [x] |
| Waiting room: room code, waiting slip, seat banners (read-only), rules chart, Leave table | Banner, ChartSheet | [x] |

### Game screen (`screens/GameScreen.tsx`, `panels/*`, `hud/Hud.tsx`)

| Item | Pattern | Status |
|---|---|---|
| Hall background, oak war table, board on a vellum ChartSheet (board art untouched) | Court + Chart | [x] |
| Player banners on a pole: arms, VP numeral, name ribbon, lit current, hidden VP, cards/pieces gloss, hover highlight | Banner | [x] |
| Instruction ribbon above the board (same text as the live region) | ribbon | [x] |
| The Lists: logo, room chip, Round, time of day, First to N + leader meter, Claims | OakPanel | [x] |
| Turn panel content (Playing / Next up, stats) folded into banners and gloss | Banner | [x] |
| The Herald: Recent log (¶ entries, arms, resource art), Full log | OakPanel | [x] |
| Last roll with bone dice | dice | [x] |
| Toolbar: Undo, Full log, Rulebook, Mute, Settings, Leave (round brass) | icon buttons | [x] |
| Thy Treasury: hand cards (real art, +N wax seal, zero dimmed), count, hold-to-reveal | OakPanel | [x] |
| Scale-bar hand-limit meter + "N to the limit" / "A 7 would cost you N cards" | meter | [x] |
| Build tab: 4 items, cost (art), N left, status words, toasts on decline, Esc to cancel | tabs | [x] |
| Cards tab: empty state, rows, New · next turn, status reasons, VP hidden, Played fan | tabs | [x] |
| Trade tab: Bank (give/get rates, bank stock, stepper, button text), Players (counts, To, Offer), offer out + Withdraw | Bill of Exchange | [x] |
| Roll and End turn buttons, Space hints, Next up, turn timer badge | primary | [x] |
| Rookie tips (setup, robber, build) | map note | [x] |
| 2D board / 3D walk switch (duel-call pulse) | brass plaque | [x] |
| Hex tooltip, placement markers, show-why reasons, robber targets | map note, ink rings | [x] |
| Dice roll overlay | bone dice | [x] |
| Flying gains | parchment tags | [x] |
| Toasts (good, bad, gold, info) | herald's slip | [x] |
| Connection banner (reconnecting, lost + Main menu) | iron plaque | [x] |
| Loading 3D ("Building the island…") | torch loader | [x] |
| Walk layer markers (walkers, fights) | board overlay (kept) | [x] |

### Dialogs (`modals/GameModals.tsx`, `InfoModals.tsx`, `panels/RightRail.tsx`)

| Item | Pattern | Status |
|---|---|---|
| Who shall go first? (roll-off rows, Start setup) | decree + bone dice | [x] |
| Discard N cards (not dismissable; steppers, N / N chosen, Discard) | decree, wax-seal pips | [x] |
| Choose whom to rob (not dismissable; arms rows, card counts) | decree | [x] |
| An offer arrives (not dismissable; receive/give, hand, Accept/Counter/Decline, lack message) | A Bargain Offered | [x] |
| Counter composer (give/want steppers, Send counter, Back) | Bill of Exchange | [x] |
| Year of Plenty (picker, Chosen chips, Invoke) | decree | [x] |
| Monopoly (picker) | decree | [x] |
| Man up: choose your opponent | decree | [x] |
| Card details (art, text, flavour) | decree | [x] |
| Chronicle (search, filters, Export JSON, rows, Nothing recorded.) | ChartSheet cartouche | [x] |
| Leave this game? (local: Main menu / New game… / Restart same seed / Cancel; online: Leave game / Stay) | decree | [x] |
| Pass the device curtain (reason, I am X — reveal, withdraw offer) | full-screen hall + decree | [x] |

### Other screens

| Item | Pattern | Status |
|---|---|---|
| Victory: winner banner lit, title, Final reckoning, Rolls of fate, Spoils, buttons | ChartSheet | [x] |
| Settings (title and in-game): banner tabs, every option, Done / Restore defaults, Back | ChartSheet | [x] |
| How to Play: open book, ¶ chapters, Costs table, Keys | ParchmentSheet | [x] |
| Character: banner preview of arms, profile fields, existing 3D preview kept | OakPanel | [x] |
| My kingdom: existing options and 3D preview kept | OakPanel, ChartSheet | [x] |
| Error boundary screen | decree | [x] |

### Layouts

| Item | Status |
|---|---|
| Wide ≥ 1280 (rails 256 / 286) | [x] |
| Mid 900–1279 (rails narrow, banners about 120 wide) | [x] |
| Narrow < 900: board on top, pennant strip, Treasury bottom sheet, sticky End turn, Herald and Lists behind a toolbar icon | [x] |
| 44 px minimum targets everywhere | [x] |

## Where the result differs from the brief

These items are deliberately not built, because the game has no such feature and the brief forbids
new behaviour. The design leaves room for them.

| Brief item | What exists instead |
|---|---|
| Lobby "Card limit on a 7" and "Turn timer" rows | The lobby has no such settings. The limit is fixed at 7; the turn timer is a personal setting in Settings › Gameplay. |
| Menu "2D · 3D" plaque | The 2D/3D switch exists only in a game (bottom right of the board). The menu keeps the sound button and Quit. |
| Invite "Copy link" | There are no join links, only codes, so the letter has Copy code. |
| Join code as separate letter boxes plus "paste link" | One wide ink input (same validation and test id). No links exist. |
| Trade offer countdown | Offers have no timer. |
| "Away" tag on a disconnected player's banner | The game state holds no per-seat connection status during play (only the lobby does). Autopilot still covers absent players. |
| Settings live preview | No setting had a preview; the chart shows the compass rose there instead. |
| Settings "Of the Keys" tab | There is no key rebinding; the key list stays in How to Play. |
| FPS/GPU/CPU/LAT overlay | The 2D game never had one; frame rate is checked with `LAG=1 pnpm e2e lag` (60 fps, no jank). |
| 4.5:1 contrast | Text sits on parchment, ribbons or dark oak with shadows as in the kit. It was checked by eye on every screenshot, not measured with a tool. |

## Decisions

- The 3D walk's HUD keeps the old shared classes (`.panel`, `.btn`, `.chip`), so the 3D mode
  looks exactly as before. The 2D UI uses only the new `hc-*` classes and `ui/hall` components.
- Settings has three sections today (Sound, Display, Play). The banner tabs show four: **Gameplay**
  (the Play options), **Board** (graphics, 3D resolution, theme, UI scale, mouse look), **Sound**
  and **Access** (reduce motion, colorblind assist, show why). The game has no key rebinding, so
  there is no "Of the Keys" tab; the key list stays in How to Play.
- Theme setting: **Ember** is the Hall & Chart default. **Frostbound** keeps the same hall with
  silver metals and a colder torchlight.
