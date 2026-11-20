# Catan Night: rebuild the entire 2D UI in the "Hall & Chart" medieval design

## Your task

Restyle **every 2D screen, panel, dialog, overlay and control** in Catan Night to the "Hall & Chart" design in `design/hall-chart/`. The look is a lord's great hall at night (stone walls, torches, heraldic banners on a pole, wax seals, oak-and-iron panels). Wherever the game shows information about the island, it is drawn as an old sea chart (parchment scrolls, inked rules, map-style notes).

### Style DNA: Hall & Chart = Royal Court + Sea Chart
The design is a fusion of two directions. Every screen must show both halves:

| From **Royal Court** (the hall: things you press, people and status) | From **Sea Chart** (the chart: information about the island) |
|---|---|
| Stone hall background, vignette, stone columns, night windows | Vellum **chart sheets** with rolled wooden ends, neat lines and ink tick marks |
| **Heraldic banners** on a turned pole with spear-tip finials (menu, seats, players, settings tabs) | **Cartouches**: scroll-framed boxes for rules, legends, logs, scores and summaries |
| **Torches** with warm glow; candles on the war table | **Compass rose** as a decorative mark on chart sheets (e.g. settings preview, victory sheet, lobby rules, loading screen). **Never on or over the board art.** |
| **Wax seals** for confirming (Accept, Done, Seal & send) and on letters | **Map notes**: tooltips as paper slips with dashed ink leader lines |
| Coats of arms for every player; crest in the title | **Scale-bar meter** for the hand limit |
| Gold blackletter titles, brass plaques, iron plaques, oak-and-iron panels | Ink typography (IM Fell), red-ink rubrics, dotted ink dividers, ink bar charts (rolls chart) |
| Decrees (dialogs) on parchment with a seal | The war table holding **the game's own board** framed as a chart, with the board art left untouched |

If a new screen has no mockup, give it at least one Royal Court element (stone hall, banner or seal) and one Sea Chart element (chart sheet, cartouche or map note).

This is a **visual and UX redesign only**:
- Game rules, state, networking, saving, AI, the 3D mode and every behaviour stay exactly as they are.
- When you finish, every flow the game supports today must still work, with the same information and the same states, just in the new design.

Work methodically through the phases below. The goal is that nothing in 2D is left in the old style, and nothing breaks.

---

## 0. Non-negotiable rules (read twice)

1. **Keep the game's own art assets. Do not redraw them.** This is the most important rule.
   - **The board stays exactly as it is today.** That means its hex tiles, terrain illustrations, number tokens, harbours/ports (2:1, 3:1 discs and piers), ships, windmills, trees, houses, roads, cities, the robber and its frame/background. Do not replace any of it with the SVG hexes in the reference mockups.
     - The hexes, wax-seal number tokens, rhumb lines, compass rose, sea serpent and waves drawn **on** the board in `reference/*.html` are **placeholders**. Do not port them.
     - Do not apply CSS filters, recolouring, blend modes or overlays that change how the board art looks.
   - **The resource card art stays as it is today** (the lumber logs, brick stack, wool, grain sheaf and ore illustrations used in the hand panel).
     - Use that art **everywhere a resource appears**: hand panel, build costs, trade composer and trade offers, bank/port trade, discard picker, Year of Plenty / Monopoly pickers, victory "spoils", log lines, tooltips, toasts.
     - The line icons for resources in the reference files are placeholders. Do not ship them in place of the real art.
     - If an art asset is too small to read below about 24px, use a tightly cropped version of the same art. Never swap it for a different icon.
   - **Keep every other existing illustration as it is:** character/portrait art, sigil art, dev-card art, achievement art, the 3D-mode thumbnails, the logo if it's an image.
   - **What *is* new:**
     - Everything around the art: backgrounds, frames, panels, banners, buttons, typography, controls, dialogs, tooltips, toasts, meters, layouts.
     - Overlay UI drawn **on top of** the board: hover tooltip, placement target markers, blocked-spot reasons, robber-move prompt, gain/loss pop-ups, dice.
2. **2D only.** Do not change the 3D renderer, the 3D walk or the "Man up" duels. Restyle only the 2D-side entry points to 3D, such as the 2D/3D switch and any "enter duel" prompt.
3. **No behaviour changes.** Keep:
   - every handler, route, state machine, network message, store, save format and timer;
   - every condition for when a control appears, is enabled, or is hidden (e.g. Continue only when a save exists, Rejoin only when a live room exists);
   - every keyboard shortcut.

   If a component mixes logic and markup, split it carefully: logic stays, markup and styles change.
4. **No lost information.** Every label, number, status word, error message, empty state, loading state and edge case that exists today must still appear somewhere in the new design.
   - Use `design/CATAN_NIGHT_2D_PROMPT.md` (in this repo) as the inventory of what exists. It lists every 2D screen, rail, tab, status word, error message, modal, setting and the vocabulary.
   - You may restyle wording into a heading's display text (see §6), but the meaning, and any string tests or aria labels depend on, must survive.
5. **Accessibility is part of the design, not optional:**
   - real `<button>`, `<input>` and `<label>` elements;
   - visible focus rings (`--focus-ring`);
   - 44px minimum targets;
   - 4.5:1 text contrast, including text on banners and parchment;
   - `prefers-reduced-motion` respected;
   - colour never the only signal (players always show colour **and** sigil/arms);
   - all existing keyboard play kept.
6. **Performance:**
   - Use the **pre-rendered tileable textures** in `assets/textures/` (PNG) for stone, parchment, vellum, oak and cloth weave.
   - Do **not** run SVG `feTurbulence`/`feDisplacementMap` filters at runtime on large or animated areas. The mockups use them, but production must not.
   - SVG ornaments (banners, poles, seals, frames) are fine as inline SVG components or static `.svg` files.
   - Keep the board at the same frame rate it has today. Measure before and after with the existing FPS/GPU/CPU/LAT overlay.

---

## 1. What you have

The design kit lives in `design/hall-chart/`. Read every file before writing code.

| Path | What it is |
|---|---|
| `reference/menu.html`, `lobby.html`, `game.html`, `settings.html` | Static 1440×900 mockups of the four key screens. Open them in a browser; take screenshots with Playwright if available. They are the **visual source of truth**. All names, codes and numbers in them are sample data. **Their board drawings are placeholders. Ignore them.** |
| `tokens.css` | Every colour, font, size, spacing, depth, motion and texture token, plus reference button recipes. Port these into the project's styling system (CSS variables, Tailwind theme or CSS-in-JS, whatever the project uses). |
| `assets/banners/*.svg` | Finished banner cloths: the six main-menu banners, four player-banner templates and five plain banners (one per tincture). Shows exactly how a banner is built (see §3.2). |
| `assets/ornaments/*.svg` | Banner pole (turned wood, brass bands, spear-tip finials, iron brackets), spear finial, label ribbon/scroll, title ribbon, wax seals, crest, torch, night window, stone column, candle, coin stack, scroll frame (chart sheet with rolled ends), scale-bar meter, iron corner bracket, compass rose (decoration only; never on the board). |
| `assets/heraldry/*.svg` | Heraldic charges (lion, star, tower, fleur-de-lis) and example coats of arms. |
| `assets/dice/bone-die-1…6.svg` | Bone dice faces. |
| `assets/textures/*.png` | Tileable textures: stone wall, parchment, vellum, letter paper, oak; plus a cloth-weave overlay SVG. |

The repo also has `design/CATAN_NIGHT_2D_PROMPT.md`: the full inventory of the current 2D UI (screens, rails, tabs, modals table, settings, vocabulary). Treat it as the checklist of **what** must exist; this file and the kit define **how it looks**.

---

## 2. Phase 0: discover and plan (no visual changes yet)

1. **Stack:** identify the framework, styling approach, router, component folders, where 2D vs 3D code lives, and how assets are loaded.
2. **Art assets:** locate every existing art file and record their paths in the plan. That includes board tiles, tokens, ports, pieces, robber, board frame, resource cards, dev cards, sigils, portraits, logo and audio.
3. **Inventory:** walk `design/CATAN_NIGHT_2D_PROMPT.md` and the code, and produce **`design/hall-chart/MIGRATION_CHECKLIST.md`**. It must contain one line per screen, panel, modal, overlay, toast type, banner, empty/loading/error state and setting. Each line names the component file(s), the design pattern it maps to (from §4 and §5), and a status box.
   - It must also cover screens that aren't mocked up: My Kingdom, Character, How to Play / Rules, Join + waiting room, victory, every dialog, the phone layout, loading and connection-lost states.
4. **Old styles:** grep for hard-coded colours, fonts, shadows, border-radii and the current button/panel components. List what will be replaced.
5. **Baseline screenshots:** run the app and save screenshots of every screen and modal you can reach at 1440×900, 1280×720 and 390×844 (if the game supports phones) into `design/hall-chart/before/`.
6. **Commit** the checklist and screenshots. Then continue.

---

## 3. Phase 1: build the design system (in isolation)

Create a self-contained UI kit folder (e.g. `src/ui/hall/`; match the project's conventions) and a **dev-only kit route/page** (e.g. `/dev/ui-kit`) that renders every component in every state on the stone background. Review it against the reference HTML before touching real screens.

### 3.1 Foundations
- **Fonts and tokens:** load the fonts from `tokens.css`, with a self-host fallback if the project already self-hosts fonts. Port all tokens.
- **Blackletter (`--font-title`)** is used only for:
  - screen titles of 32px and larger (e.g. "Catan Night", "Muster the Table", "Of the Board", "A Bargain Offered");
  - large score numerals on player banners;
  - the room code on the invite letter.

  Labels and buttons use `--font-label`. Body text, numbers, inputs and logs use `--font-body`.
- **`<HallBackground>`:** tiled stone wall, plus a heavy inner vignette (`--vignette`). Optional slots for:
  - two **stone columns** at the edges;
  - **night windows** (pointed arch with stone mullions, starry sky, crescent moon, a very faint moonbeam);
  - **torches** (each with a warm radial glow, `--torch-glow`, of radius about 200px);
  - a **war table** (oak texture, 8px darker top edge, top shadow).

  Every decorative layer is `aria-hidden` and `pointer-events:none`.
- **Surfaces:**
  - `ParchmentSheet`: letters and decrees. Parchment texture, 4px radius, `--shadow-paper`.
  - `ChartSheet`: vellum with **rolled wooden-looking ends** at top and bottom (`scroll-frame-600x400.svg` shows the construction: rounded bars with spiral ends), a 1.4px inner neat line and small ink tick marks along the top and bottom edges. Ornaments sit outside the content box, and content is padded so nothing touches them.
  - `OakPanel`: oak texture, 2px `--oak-deep` border, 3px `--oak-edge` inner bevel, **iron L-brackets with three rivets on all four corners**, a parchment inset with a soft inner shadow, and an optional **brass title plate** (small-caps label, centred on the top edge, half outside the panel). Used for every rail panel.

### 3.2 The banner system (the signature; get this exactly right)
Build `<Banner>` and `<BannerPole>` from the SVGs in `assets/banners/` and `assets/ornaments/`.

**`<Banner>` anatomy, back to front:**
1. **Shadow:** a soft drop shadow of the cloth, offset (5, 8), 45% black.
2. **Hanging:** three brass **rings** around the pole at 18% / 50% / 82% of the width, each with a small cloth loop under it.
3. **Cloth shape:** straight top edge; sides with a very slight curve (hanging cloth); **swallowtail** bottom. The notch rises 30% of the banner's width from the bottom.
4. **Field and ordinary:** field in a heraldic tincture, plus an optional ordinary in a second tincture. The ordinaries are *pale* (vertical stripe), *chevron*, *bend* (diagonal), *chief* (top band), *quarterly*, *saltire* or *paly*. Follow the rule of tincture: colour on metal or metal on colour, never colour on colour.
5. **Cloth texture, clipped to the shape:** cloth-weave overlay, light grain, then the **fold gradient** (horizontal: dark edges, alternating light/dark vertical folds), then a top/bottom shade.
6. **Embroidered border:** 3px `--gold` stroke inset about 10px, plus a 1px dashed `--gold-light` stitch line.
7. **Outline:** 2px `--ink` around the whole cloth.
8. **Gold fringe** along both bottom edges (1.6px lines every 4.5px, 10px long) and a **tassel** at each tail point (cord, brass knob, gold skirt).
9. **Emblem**, centred at about 30% of the height. Either:
   - a **brass-rimmed sable medallion** with the icon in `--gold-light` over a darker copy (embossed look), or
   - a **coat of arms** (player banners; see §3.4).
10. **Label scroll:** a parchment ribbon laid across the cloth at about 58% of the height, 22px wider than the banner on both sides, with folded tails behind. The label is real HTML text (small caps, `--ink`) centred on the ribbon. That's what makes every banner readable.
11. **Gloss** (optional): italic `--font-body`, light parchment colour with a dark text shadow, under the ribbon.

**Props:** `tincture`, `ordinary`, `ordinaryTincture`, `icon` | `arms`, `label`, `gloss`, `size`, `lit`, `as` (button | div), `disabled`, `selected`, and the usual aria props.

**States:**
- **Hover:** a gentle sway, rotating about −1° around the top centre over `--dur`.
- **Focus:** the focus ring around the cloth.
- **Lit / selected:** a warm double glow, gold outer plus a tighter light-gold edge.
- **Pressed:** a translate of 2px.
- **Disabled:** desaturated by 60%, a dimmed label, and the reason exposed through `aria-describedby`.

Reduced motion turns off the sway.

**`<BannerPole>`:** a turned wooden rod (vertical gradient) with brass bands about every 140px, **spear-tip finials** at both ends and iron wall brackets with chains going up. Banner rings must sit exactly on the rod's centre line: compute the ring y from the pole y; don't eyeball it.

### 3.3 Controls (all on the kit page with every state)
- **Buttons:**
  - **Primary (crimson-gold):** End turn, Begin the game, Play-type confirms.
  - **Dark (oak-gold):** secondary actions on stone.
  - **Brass plaque:** utility actions on stone, e.g. back, 2D/3D, Seat a bot.
  - **Iron plaque:** Quit and other destructive exits.
  - **Round brass icon button:** the toolbar.
  - **Paper button:** actions on parchment.
  - **Wax-seal button:** a wax seal with a text label next to it, for Accept / Done / Seal & send. The seal is never the only label.

  Each button has hover (slightly brighter), focus, pressed (translate 2px, smaller shadow), disabled (55% opacity plus the reason text) and loading states.
- **Form controls on parchment:**
  - check box: a 30px ink square with a red-ink tick;
  - segmented control: ink-ruled, with the selected option filled in map ink;
  - select;
  - text input: an ink rule plus a paper fill;
  - stepper: −/+ boxes with a red numeral;
  - range: `accent-color: --rubric`, with the value shown in red.
- **Tabs:**
  - Inside panels: small-caps words with a red underline on the selected tab.
  - At the top of Settings: **hanging banner tabs on a pole**. The selected banner is longer and lit.
- **Scale-bar meter:** the map scale bar. Alternating ink/paper segments for 0–limit, red/pink beyond the limit, a dashed red line at the limit and a red pointer at the current value. It replaces the old 7-card limit meter. Keep its aria `role="meter"` and values.
- **Tooltip as map note:** a paper slip with an ink border and a 2px offset ink shadow, plus a dashed ink leader line from the slip to the point it describes. The title is red italic and the details are ink italic.
- **Toast as herald's slip:** a small parchment strip with an icon and text, sliding in from the top of the board. Keep the current durations and stacking.
- **Dialog as decree:** a parchment sheet with a blackletter title in `--rubric-dark`, an optional coat of arms of whoever it concerns, dotted ink dividers and actions in a row (wax-seal primary, paper secondaries).
  - Keep focus trapping, Escape behaviour, which dialogs are dismissible and all timers.
  - The backdrop is stone darkened to 55%. No blur on the board.
- **Bone dice:** use `assets/dice`. Keep the current roll animation timing; restyle only the dice.
- **Connection banner:** iron plaque across the top centre with the wifi-off icon and the existing message/retry controls.
- **Loading:** a turning hourglass or a slowly flickering torch, plus the existing loading text.

### 3.4 Heraldry for players
Every player is shown with **a heater-shaped shield**: a field in the player's colour, a 5%-width gold rim, an ink outline and the player's **sigil as the charge** in gold or ink, whichever contrasts with the field.

- If the game's sigils are images or icons, render them as the charge.
- Do not invent new sigils, and do not change player colour values used by game logic.
- If a colour needs a deeper cloth tone for banners, derive it for display only (about 15% darker).

The same arms appear on: player banners, lobby seat banners, trade decrees, the robber-victim picker, the score table, the profile plaque and log lines (16–20px).

---

## 4. Phase 2: migrate screen by screen

Do the screens in this order and **commit after each one**:
1. Main menu
2. Play: host lobby
3. Join + waiting room
4. In-game: wide layout
5. In-game: dialogs and overlays
6. In-game: mid and phone layouts
7. Victory
8. Settings
9. How to Play
10. Character
11. My Kingdom
12. Leftovers in the checklist

After each screen: run it, screenshot it next to its reference, and fix differences before moving on. Tick the checklist.

### 4.1 Main menu (`reference/menu.html`)
- **Title row**, centred at the top: "Catan" + **crest** + "Night" in gold blackletter at 96px. The text has a light-gold top highlight, a dark-gold bevel shadow and a soft drop shadow. Below it, the title **ribbon** reads "Trade · Build · Settle".
- **Hall:** stone background, two stone columns, two night windows flanking the title, two torches with glows.
- **Banners** on one pole, arranged **symmetrically, tallest in the centre**:

  | Order (left → right) | Width × height | Tincture / ordinary | Icon | Gloss |
  |---|---|---|---|---|
  | Settings | 128 × 300 | sable, chief gules | gear | Sound & sight |
  | Character | 138 × 340 | purpure, bend or | person | Name & arms |
  | Continue | 152 × 386 | azure, chevron argent | hourglass | the existing save summary (e.g. "Round 14 awaits") |
  | **Play** (primary, lit) | 186 × 452 | gules, pale darker gules | flag | Muster a new table |
  | My Kingdom | 152 × 386 | vert, chevron or | castle | Holdings & deeds |
  | How to Play | 138 × 340 | sable, bend azure | book | The rules |

  - Gap: 20px. Label size: 26px for Play, 20px for the others. Banner labels keep the existing menu entry names.
  - **When Continue is unavailable**, keep the skyline symmetric: drop Continue and the outermost banner on the other side (How to Play moves next to Settings), then recompute heights so the tallest stays centred. Never leave a hole.
  - **Rejoin** (when a live room exists) appears as a **sealed letter** pinned above the pole, "A summons: room <code> awaits", with a wax-seal "Rejoin" button. Don't add an eighth banner.
- **Quit:** a small **iron plaque** button bottom-right, next to the round brass **sound** button and the brass **2D · 3D** plaque.
- **Profile plaque**, bottom-left: a small OakPanel with the player's arms, name and blazon line (colour + sigil). It opens Character.
- **War table**, bottom 210px: oak, with candles, a coin stack and two bone dice as props. On the table, lay **the game's real 2D board** (a render or static image of the actual board art) on a vellum ChartSheet, in perspective (`perspective(900px) rotateX(58deg)`, origin at the top). This replaces the placeholder chart in the mockup. If rendering the live board there is expensive, use a static screenshot or image of the board art.
- **Debug overlay:** keep the FPS/GPU/CPU/LAT overlay working. Restyle it as a tiny iron plaque in the top-right corner, or leave it if it's dev-only.

### 4.2 Play: host lobby (`reference/lobby.html`)
- **Header:** a brass "The hall" back plaque, the blackletter title "Muster the Table", and Host / Join tabs as primary/dark buttons on the right.
- **Seats:** each seat is a **banner** (196 × 330) on one pole.
  - It shows the "Seat I…IV" kicker, the seat's arms (or a dashed empty shield with +), the name on the label ribbon and the status as the gloss (green when ready, amber when waiting).
  - The host seat shows a gold crown.
  - **Under each banner**, a small OakPanel holds the existing **Invite / Bot / This device** control as an ink segmented control, plus the existing **bot difficulty** select when the seat is a bot.
  - An empty seat's banner is lit to draw attention.
- **Rules**, on the right in an OakPanel titled "Articles of the Game": points to win (stepper), card limit, turn timer, board layout (segmented), seed (input + reroll), and the **board preview**. The preview must use the real board art or generator; never the placeholder.
- **Invite:** a tilted **letter of summons** on parchment, bottom-left. It shows the room code in blackletter, Copy link / Copy code paper buttons and a wax seal in the corner. Keep the existing invite card states (creating room, ready, copied, error).
- **Footer:** the existing start-blocking reason as an info strip, "Seat a bot" (dark), and the primary start button. The button stays disabled with the reason, as today.
- **Profile editing** (name / colour / sigil), wherever it lives today, uses parchment controls. A live preview of the player's arms on a banner updates as they change.

### 4.3 Join + waiting room
No mockup exists; compose it from the kit:
- **Code entry:** a parchment letter with large letter boxes for the code, plus a paste-link option.
- **Waiting room:** seat banners on a pole (as in the lobby, but read-only for non-hosts), the host's rules summary on a ChartSheet, and the existing "waiting for host" status as a herald's slip.
- **Errors** (room not found, full, expired) appear as decree-style messages.

### 4.4 In-game: wide layout (`reference/game.html`)
- **Centre:** an oak war table (8px bevel) holding **the existing board, unchanged**, on a vellum ChartSheet frame. Rolled ends at top and bottom only; nothing covers the board art. Candles at the two top table corners and a coin stack near the bottom-right are decoration and must not overlap the board.
- **Above the board:** **player banners** on a pole (150 × 196, gap 40). Each shows the player's arms, name on the ribbon and the **victory-point total as a 34px gold blackletter numeral between the arms and the ribbon**. Never put it in the swallowtail notch.
  - The current player's banner is lit.
  - Cards in hand / dev-card counts appear as a small gloss or on hover, depending on what the current UI shows today.
  - Keep whatever today's Turn list shows (order, current player, timers, connection state per player). A disconnected player's banner is desaturated with a small iron "away" tag.
- **Left rail** (256px), OakPanels:
  - **"The Lists":** the title chips (room, round, points to win) as small-caps lines, then **Claims** (Longest Road / Largest Army with holder and value).
  - **"The Herald":** the Recent log. Each entry is a red ¶ plus the text, with resource art and arms inline.
  - The **last roll** with bone dice under the panels.
- **Right rail** (286px):
  - the **toolbar** as round brass icon buttons;
  - the **"Thy Treasury"** OakPanel containing the hand (§4.5), the scale-bar limit meter, the **Build / Cards / Trade** tabs and their content;
  - the **End turn** primary button (62px tall) underneath.
  - Keep every status word and error message in the tabs. Show "ready" in `--ok-ink` and "lacks 1 Ore" in `--rubric`.
- **Turn instructions:** a parchment herald ribbon centred above the board, e.g. "A seven! Move the robber".
- **Board overlays:** restyle, but don't change positions or logic.
  - **Placement targets:** dashed red-ink rings with a centre dot (gold on dark tiles if contrast needs it).
  - **Hover tooltip:** the map note with a leader line.
  - **Blocked-spot reasons:** in the same note, in red italic.
  - **Robber move:** the hovered hex gets a gold ring.
  - **Gain/loss pop-ups:** small parchment tags with the resource art and +/− numbers.

### 4.5 The hand panel (user-supplied screenshot, keep the art)
Today the hand panel has a "◆ YOUR HAND" header with a "7 CARDS" chip, five cards (Lumber, Brick, Wool, Grain, Ore) each showing **the illustrated resource art**, the count and the name, a green "+1" gain badge, and dimmed cards at 0. Restyle it as:
- **Header:** "Thy Treasury" on the panel's brass title plate. The card count sits on the right as small caps, in red when over the limit.
- **Cards:** keep **the same art** inside a parchment card frame:
  - `--paper-card` fill, 1.5px ink border, 1px gold inner rule, about 3px radius, slight shadow;
  - the count in `--font-body` at 26px under the art;
  - the name in 12–13px italic.
- **Zero count:** the card at 45% opacity with its art desaturated, but still readable.
- **"+1" / "−n" badges:** a **small wax seal**: a red disc with a dashed lighter ring and the cream text "+1". It sits top-right and pops in with `--dur`.
- **Meter:** the scale-bar meter goes directly under the cards, with the existing over-limit warning text.

### 4.6 In-game dialogs and overlays (all of them)
Go through the **modals table** in `design/CATAN_NIGHT_2D_PROMPT.md` and restyle **every** dialog as a decree, keeping its trigger, dismissibility, contents and buttons. Patterns for the common ones:
- **Trade offer received:** "A Bargain Offered". The sender's arms, "<name> offers two Wool for one Ore", a "you get ⇄ you give" row using the **real resource art**, Accept (wax seal), Counter and Decline (paper), and the existing countdown.
- **Trade composer:** a "Bill of Exchange" layout. "You give" and "You get" columns with steppers, an explicit arrow between them, target selector chips (everyone / each player) and per-player replies (accepts / declines / counter). Bank and port trades show their ratios, using the existing harbour info.
- **Discard on a 7:** "Discard N cards". Resource cards with the real art and −/+ per card, a progress row of N wax-seal pips, and confirm disabled until exactly N are picked ("Pick 1 more").
- **Robber victim:** "Take a card from…", with one row per eligible player: arms, name, card count.
- **Year of Plenty / Monopoly / Road Building:** resource pickers with the real art.
- **Confirm end turn, leave game, abandon save:** short decrees.
- **Achievements / claims taken** (e.g. Longest Road): a herald slip or a small decree.

### 4.7 Mid and phone layouts
Keep the current breakpoints and what each one shows.
- **Mid:** the rails narrow (220 / 260). Player banners shrink to about 120 wide, the VP numeral to 28px.
- **Phone (about 390 wide):**
  - the board stays on top;
  - player banners become a horizontal strip of mini pennants (arms + VP);
  - the Treasury becomes a bottom sheet with its tabs and the hand art;
  - End turn is sticky at the bottom;
  - the Herald and the Lists sit behind an icon in the toolbar;
  - dialogs become full-width decrees.
- Every target stays 44px or larger.

### 4.8 Victory screen
- A full **ChartSheet** with "<Winner> wins with N points" in blackletter and the winner's banner lit and centred above it.
- The existing **score table** on parchment with inked rules: rank, arms + name, the existing columns, total in red.
- The existing **rolls chart** drawn as an ink bar chart with dashed "expected" marks; 7s in rubric red.
- The existing **spoils**, using the real resource art.
- The existing buttons (e.g. view board / main menu) as plaques and primary buttons.

### 4.9 Settings (`reference/settings.html`)
- **Section tabs:** hanging **banner tabs** on a pole, one per existing section. The selected one hangs longer and is lit.
- **Content:** a large ChartSheet with the blackletter section title (display style "Of the Board", "Of Sound", etc.; see §6) and an italic subtitle "kept as you change it" (or "saved on Apply" if the settings use Apply).
- **Options:** every existing option, as the matching parchment control (toggle → ink check box; enum → segmented control or select; number → stepper or range with the value; key binding → ink key-cap buttons with a "Press a key…" listening state).
- **Preview:** a live preview on the right where one exists today (e.g. board/token options), using the real board art.
- **Footer:** a "Done" wax-seal button and a "Restore defaults" paper button.
- A brass "Back" plaque on the left.
- Keep every option, choice and default from the inventory.

### 4.10 How to Play, Character, My Kingdom, and anything else
These have no mockup. Build them from the kit:
- **How to Play:** an open book of parchment pages, chapters as rubricated headings with ¶ markers, and the existing images and diagrams kept as they are.
- **Character:** a large banner preview of the player's arms beside parchment controls for the existing profile fields.
- **My Kingdom:** the existing content laid out on ChartSheets and OakPanels. Keep every number and list.

Anything else in the checklist gets the closest pattern from §3–4.

---

## 5. Layout and composition rules
- **Background:** the stone hall (with vignette) is the background for every full screen. Parchment and vellum are surfaces; oak is for panels; brass and iron are for buttons. Don't mix more than **three** material types in one panel.
- **Heraldry:** at most **one lit banner** per screen. Banner colours come only from the tincture set and the players' own colours.
- **Symmetry:** keep compositions symmetric where the mockups are (menu, settings tabs). Elsewhere, align to a clear grid: rails, a centred board, consistent 24px gutters.
- **Decoration** (columns, windows, torches, candles, coins, dice) must **never** overlap interactive controls, text or the board art, and must be hidden from assistive technology.
- **Text over textures:** only on a solid enough surface (ribbon, parchment, oak inset) or with the text shadow from the reference. Check contrast.

---

## 6. Copy and tone
- **Flavour in headings only.** Functional labels, button text, status words and error messages keep their current wording and meaning. Use plain modern English for anything the player must act on.
- **Heading display names used by the design** (display only; keep the underlying keys and aria labels meaningful):

  | Where | Heading |
  |---|---|
  | Host lobby title | Muster the Table |
  | Rules box in the lobby | Articles of the Game |
  | Invite card | A letter of summons |
  | Recent log panel | The Herald |
  | Title chips + Claims panel | The Lists |
  | Hand panel | Thy Treasury |
  | Incoming trade dialog | A Bargain Offered |
  | Trade composer | Bill of Exchange |
  | Settings sections | Of Gameplay / Of the Board / Of Sound / Of Access / Of the Keys |

- **Small italic glosses** on banners and panels are allowed, but keep them short (2–4 words).
- **No pseudo-archaic wording in instructions, errors or buttons.** "Thy" appears only in the "Thy Treasury" heading above.

---

## 7. Definition of done
- [ ] Every line in `design/hall-chart/MIGRATION_CHECKLIST.md` is ticked, and no 2D component still uses the old colours, fonts or button styles (grep proves it).
- [ ] **The board, resource cards and every existing illustration look pixel-identical to before**; compare against the `before/` screenshots. None of the placeholder board art from the reference files exists in the codebase.
- [ ] Main menu, lobby, game and settings match their reference HTML at 1440×900 (allowing for real data and the real board).
- [ ] Join, waiting room, every dialog, victory, How to Play, Character, My Kingdom, toasts, loading, connection-lost and empty states are done in the kit's patterns.
- [ ] Mid and phone layouts work, with 44px targets.
- [ ] Keyboard play, focus rings, reduced motion, screen-reader labels and colour + sigil identification all work. Contrast is 4.5:1 or better on all text.
- [ ] 3D mode, duels, online play, saving/continue/rejoin, bots and every existing test still pass. Add or update tests where markup changes broke selectors, without weakening them.
- [ ] Frame rate on the game screen is the same as before (use the FPS overlay), and no runtime SVG noise filters cover large areas.
- [ ] The `/dev/ui-kit` page shows every component and state.
- [ ] `design/hall-chart/after/` holds screenshots of every screen and modal at 1440×900, 1280×720 and 390×844.

## 8. How to work
- **Keep commits small:** one per phase and one per screen, each with a clear message.
- **When in doubt about what the game shows, read the code and the inventory**, and keep it. When in doubt about how it looks, open the reference HTML and the SVG assets. If something is truly undecided, choose the option that keeps the game's own art untouched and the UI readable, and note the decision in the checklist.
- **Don't stop halfway.** If a phase is long, finish it before starting the next, and keep the app runnable after every commit.
