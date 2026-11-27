# Catnight UI plan: Hall & Chart, rebuilt in Unreal and done properly

Written 2026-11-21 for the owner and for whoever builds it (Claude, Codex or a person).
Companion documents: `docs/UNREAL_NATIVE_PLAN.md` (phases), `docs/CATNIGHT_PARITY.md` (every
feature), `docs/CATNIGHT_HANDOFF.md` (current state), `design/CATAN_NIGHT_2D_PROMPT.md` (every
screen, label and state of the web game), `design/hall-chart/` (the original brief, SVG assets,
HTML references and before/after screenshots of the web version).

---

## 0. The brief in one paragraph

The interface is **Hall & Chart**: a lord's great hall at night (**Royal Court**: stone, torches,
heraldic banners on a pole, wax seals, oak and iron, brass) around an old sea chart (**Sea
Chart**: parchment, vellum, ink rules, cartouches, map notes, a compass rose). Royal Court is for
*people and things you press*; Sea Chart is for *information about the island*. Every feature,
label and state of the web game stays. What changes is the craft: in Unreal the hall is a real lit
place, the board is a real miniature on a real table, and the interface is made of materials that
catch the torchlight, move with weight and stay readable at a glance on a monitor, a TV and a
Steam Deck.

---

## 1. What was wrong with the web version (so we never repeat it)

Looked at side by side (`design/hall-chart/after/*@1440x900.jpg`):

| # | Problem in the web UI | Why it looks cheap | Rule for Unreal |
|---|---|---|---|
| 1 | **Flat vector clip-art.** Banners, torches, stone, brass are SVG shapes with gradients. Torches glow but light nothing; banners never move. | Nothing belongs to one lit space; it reads as stickers on wallpaper. | Every Royal Court object is either a real 3D object in the lit hall or a 2D element drawn with a *lit material* that takes its light from the hall (§4.4). |
| 2 | **The board is small.** On the game screen the island takes about 38 % of the window; the parchment frame around it is empty paper. | The game is the island; the chrome won. | The 3D table gets **at least 60 % of the screen** in every layout. Chrome hugs the edges and folds away when not needed (§6). |
| 3 | **Everything shouts.** Six parchment panels of equal weight, two banner rows, a ribbon, a dice box, a toolbar. | No hierarchy: the eye has nowhere to land. | Three tiers only: *what to do now*, *your hand and actions*, *everything else* (quiet, opens on demand) (§5.2). |
| 4 | **Type hard to read.** Small italic IM Fell, blackletter used for headings at small sizes, cream on cream. | Medieval fonts at small sizes look like noise. | Blackletter only for titles ≥ 40 px and numerals. Body ≥ 18 px (1080p), never italic for something you must read. Contrast ≥ 4.5:1, measured (§4.2). |
| 5 | **Mixed icon styles.** Modern line icons (gear, flag, book, user) on medieval banners and brass buttons. | Two eras in one button. | One **engraved woodcut icon family**, drawn for this game (§4.5). |
| 6 | **Stat rows illegible.** Tiny glyph+number rows under each player banner (cards, settlements, cities, roads). | Data as decoration. | Stats appear when you look for them (focus/hover on a banner shows a cartouche), and the important ones are big (§7.3). |
| 7 | **Dialogs slapped on the board.** A parchment rectangle covers the island centre. | Hides the thing you're deciding about. | Decrees arrive from the side on a lectern and never cover the island's centre; the camera eases aside if needed (§8.1). |
| 8 | **Cramped action panel.** The Build tab scrolls; cost art is tiny; status words in italic. | You hunt for the button. | Four big build plaques always visible without scrolling; costs as real card art; one clear status word (§7.6). |
| 9 | **Repetition.** The stone-wall tile and the parchment noise repeat visibly. | Wallpaper. | Large non-repeating textures (macro + detail blend), world-space stone in 3D (§4.4). |
| 10 | **No feel.** Clicks have sound but no weight; dice pop in flat; cards don't travel. | Toy-like. | A motion and foley language: cloth sways, seals stamp, parchment unrolls, dice roll on the table, cards fly into your hand (§4.6, §4.7). |

What the web version got right and we keep: the Royal Court / Sea Chart split, the banner anatomy,
heraldic arms for players, wax-seal confirms, decrees for dialogs, the scale-bar hand-limit meter,
the herald's log with ¶ marks, the real resource-card art, the "one lit banner per screen" rule,
plain button words with flavour only in headings.

---

## 2. The look we are going for

Picture a 3D game's menu and HUD that look as if they were made on purpose for this world:

- **The hall is real.** Stone walls with depth and mortar, a vaulted ceiling fading into darkness,
  two to four torches whose flames flicker and actually light the walls, the banners and the table
  (Lumen). Tall windows with moonlight. A long oak war table in the middle with candles and the
  island on it.
- **The table is the stage.** The board is the 3D miniature we already built. Dice are bone dice
  that roll on the oak. The bank is a small iron-bound chest of card stacks at the table's corner.
  Your cards fan in front of you.
- **The interface is objects, lit by that light.** Banners are cloth that sways and creases.
  Brass catches the torch. Wax seals have a soft sheen. Parchment has fibres, foxing and curled
  edges, and casts a shadow on what's below it.
- **Information is ink on a chart.** Clean, sharp, high-contrast ink on light paper: numbers,
  costs, odds, logs, scores. The chart is where you read; the hall is where you act.
- **Restraint.** Few things at once, big when they matter, gone when they don't. One lit banner.
  One primary action. Calm, crafted, never cluttered.

Reference mood (for whoever paints concept frames): a candle-lit war council in a stone keep;
illuminated manuscripts for ink and rubric red; Age of Empires IV / Crusader Kings III for
readable heraldry; Inscryption / Darkest Dungeon for lit, physical UI; Slay the Spire for
card-hand clarity. *Mood only: no copying of their assets or layouts.*

---

## 3. Principles (apply to every screen)

1. **Board first.** ≥ 60 % of the screen, never covered in its centre by a panel or dialog.
2. **One question at a time.** The Herald's ribbon always says the single thing to do now. Forced
   choices (discard, rob, answer an offer) take focus; everything else waits.
3. **Three tiers.** (1) the ribbon and the primary action, (2) your hand and the action board,
   (3) lists, log, claims: small and quiet, expand on demand.
4. **Royal Court = act, Sea Chart = read.** Buttons are brass, wax, oak, cloth. Data is ink on
   parchment or vellum. Don't mix them in one element.
5. **Lit, not printed.** Every surface uses a material that responds to the hall's light (§4.4).
   No large flat fills.
6. **Readable at arm's length and on a Deck.** Minimum sizes in §4.2; test at 1280×800 and from
   2 m on a TV.
7. **Weight.** Things travel, land, settle. Nothing just pops. Reduce motion keeps results and
   drops travel.
8. **Plain words on buttons.** Flavour in headings only ("A Bargain Offered"); the buttons say
   Accept / Counter / Decline. Same labels and states as the web game (`CATAN_NIGHT_2D_PROMPT.md`).
9. **Colour is never alone.** Players have colour *and* sigil *and* name; resources have art *and*
   name; states have colour *and* a word.
10. **Every control works with mouse, keyboard and gamepad**, and shows the right button glyphs.
11. **Everything from text.** No hand-edited binary assets that an agent can't recreate: widgets
    in C++, materials and textures made by scripts (§10.1).

---

## 4. Design system ("HallKit")

### 4.1 Colour tokens

Kept from the web kit (`apps/web/src/ui/hall/hall.css`), now as a `UCatnightTheme` data asset and
a material parameter collection `MPC_Hall` so materials and widgets read the same values.

| Group | Tokens |
|---|---|
| Stone | `stone-mortar #16120f`, `stone-1 #29241f`, `stone-2 #2e2823`, `stone-3 #27221d` |
| Text on dark | `on-dark #f1e3c2`, `on-dark-muted #cdb98e`, `on-dark-ok #bfe8a0`, `on-dark-warn #ffc08a` |
| Ink on paper | `ink #1a120b`, `map-ink #3a2614`, `map-ink-muted #6b4e2e`, `rubric #a8281e`, `rubric-dark #7a1912`, `ok-ink #2f5a46` |
| Paper | `vellum #e9d5a8`, `parchment #ead6ad`, `paper-card #f1e4c4` |
| Metal | `gold #d9a93f`, `gold-light #f3d27a`, `gold-dark #8a6018`, `brass #b48a3a`, `iron #2a2a2e`, `iron-rivet #8a8a90` |
| Oak | `oak #3a2414`, `oak-grain #24150b`, `oak-edge #5a3a20`, `oak-deep #120a05` |
| Tinctures | `gules #8a1a16`, `azure #1f3a7a`, `vert #24543a`, `sable #1f1b18`, `purpure #4f2560`, `or #c99a2e`, `argent #e6dcc4` |
| Wax | `wax #8e1a14`, `wax-dark #5c0f0b`, `wax-light #c2452f` |
| Players | Red `#c4302b`, Blue `#3f7fd4`, White `#e8e2d0`, Orange `#e8842c` (cloth tones derived ~15 % darker for banners) |

Themes: **Ember** (default, gold and warm torchlight) and **Frostbound** (silver metals, colder
light, same layout). A **High contrast** variant (plain paper, black ink, no textures, thicker
rules) for accessibility.

### 4.2 Type

| Role | Font (OFL) | Use | Min size at 1080p |
|---|---|---|---|
| Title | UnifrakturCook | Game title, dialog titles, victory headline, **score numerals** | 40 px (numerals 28 px) |
| Label | IM Fell English SC | Buttons, tabs, banner ribbons, section heads | 20 px |
| Body | IM Fell DW Pica (roman) | Rules text, log lines, descriptions | 18 px |
| Numbers | IM Fell DW Pica, lining figures | Counts, costs, odds, timers | 18 px (key numbers 28+) |

- Italic only for short glosses (2–4 words) and flavour lines, never for status or numbers.
- Fonts ship as TTF converted from the OFL sources (`@fontsource` only has woff/woff2: convert
  with fontTools, keep the licence files in `apps/catnight/Content/Fonts/LICENSES/`).
- Text on paper gets a faint ink bleed (1 px darker halo); text on dark gets a soft shadow.
- Steam Deck (1280×800, scale 0.8): body never below 14 px rendered; prefer the "Large text"
  setting there by default.
- Measured contrast: ≥ 4.5:1 for body, ≥ 3:1 for large text. Automated check in the UI gallery
  (§11).

### 4.3 Spacing, sizes and scale

- Reference resolution **1920×1080**; a DPI curve scales by the shorter side (0.8 at 800 p, 1.0 at
  1080 p, 1.33 at 1440 p, 2.0 at 2160 p), times the player's **UI scale** setting (80–150 %).
- Spacing steps 4 / 8 / 12 / 16 / 24 / 32 / 48. Minimum hit target 44 × 44 (56 on Deck).
- Safe zones: 3 % margin on TV/Deck, 1.5 % on monitors. Ultrawide (21:9, 32:9): chrome pins to a
  16:9 centre band; the hall fills the sides.

### 4.4 Materials (the reason it will not "look ass")

All UI materials are made by a script (like `Tools/import_models.py`) and read `MPC_Hall`
(torch flicker 0–1, torch colour, moon colour, time of day, accent). Widgets use them through
Slate brushes with dynamic material instances.

| Material | What it does |
|---|---|
| `M_UI_Parchment` | Large macro noise + fibre detail + foxing spots + darkened, slightly burnt edges; SDF rounded-rectangle mask with an irregular torn/curled edge; a soft drop shadow pass; a faint warm light gradient from the nearest torch (screen-space light position from the hall). Variants: vellum (smoother, paler), letter (laid lines), chart (neat line border, ticks). |
| `M_UI_Cloth` | Woven texture, folds from a tiled normal, **sway** in the vertex/UV distortion (sine + noise, amplitude from a parameter), velvet sheen, gold-thread border and fringe, darkening in the folds. Used for banners when drawn in 2D. |
| `M_UI_Brass` | Brushed metal with a matcap reflection of the hall, a highlight that slides with the torch flicker, engraved line icons as a normal-map inset. Hover brightens, press sinks 1 px with a darker rim. |
| `M_UI_Wax` | Seal: subsurface-like sheen, embossed sigil from an SDF, irregular rim, dull lighter edge. Press = squash 8 % and a crack-dust particle. |
| `M_UI_Oak` | Wood grain (non-repeating, world-like), iron corner brackets with rivets, worn edges. |
| `M_UI_Stone` | Only when the 3D hall isn't behind (loading screens, fallback): large blocks with per-block variation, never a visible tile. |
| `M_UI_Ink` | Text and line art "written on": a reveal mask that sweeps along the text for new log lines and dialog titles; ink bleed. |
| `M_UI_Glow` | Torchlight bloom for the lit banner and the focused element (additive, very soft). |

Rules: no element larger than 64 px is a flat colour; every paper has an edge; every metal has a
highlight; shadows fall the same way (from the nearest torch, mostly down-right).

### 4.5 Icons and ornaments

- **One icon family, engraved woodcut style**: about 60 icons (undo, log, rulebook, sound on/off,
  settings, leave, dice, hourglass, crown, road, settlement, city, card, trade, bank, harbour,
  knight, sword, fist, shield, horse, eye (reveal), lock, chest, scroll, compass, quill,
  seal, gamepad glyph frames…). Drawn as vectors, rendered to SDF textures so they stay crisp at
  every scale and can be embossed (brass), inked (paper) or stitched (cloth).
- **Ornaments** from `design/hall-chart/assets/ornaments/*.svg` as the starting point: banner
  pole, spear finials, ribbons, wax seals, crest, torch, scroll frame, scale-bar meter, iron corner,
  compass rose. Rasterise at 4× into an atlas for 2D use; the pole, torch, candle, seals and dice
  also get 3D models (Blender, scripted like the island's models).
- **Compass rose** only on chart sheets (settings, victory, lobby rules, loading). **Never on or
  over the board.**
- **Gamepad/keyboard glyphs** redrawn in the same engraved style (A/B/X/Y, LB/RB, LT/RT,
  sticks, Steam Deck buttons, Esc/Space/Enter), switched automatically by Common Input.

### 4.6 Motion language

| Event | Motion | Reduce motion |
|---|---|---|
| Banner idle | Slow cloth sway (0.2 Hz), fringe lag | Still |
| Banner becomes current | Lifts 8 px, glow fades in over 300 ms, cloth ripples once | Glow only |
| Button hover / focus | Brass brightens, label lifts 1 px, faint ring of light | Same, no lift |
| Button press | Sinks 2 px, 80 ms; wax seals squash 8 % and puff dust | Colour change only |
| Dialog (decree) open | Parchment slides in from the side and unrolls (350 ms, ease-out back) | Fade 150 ms |
| Dialog close | Rolls up and slides away (250 ms) | Fade |
| Herald ribbon change | Old text fades, ribbon flutters, new text inks in (250 ms) | Swap |
| Log line | New ¶ line inks in from the left; older lines settle down | Appear |
| Cards gained | Cards fly from the producing tiles to the hand along an arc, flip face up, the count ticks up; the "+N" wax seal stamps | Count ticks only |
| Cards spent | Cards fly from the hand to the bank chest or the partner | Count changes |
| Dice | Real dice physics on the table, camera nudges toward them, result plaque rises | Dice appear showing faces |
| Placement | Piece drops from 20 cm with a dust puff and a soft wooden knock | Appears |
| Victory | Winner's banner unfurls from the pole, horns, embers rise | Banner shown |

Timing tokens: `quick 120 ms`, `base 250 ms`, `slow 400 ms`; easing ease-out-cubic for arrivals,
ease-in for departures, small overshoot (back) only for seals and banners.

### 4.7 Sound (foley for the UI)

Every UI interaction has a matching sound on its own bus (UI): parchment rustle (open/close
dialogs), quill scratch (log line), brass click (buttons), wax stamp (confirm), cloth flap (banner
focus), coin chink (trade), card slide (hand), wood knock (placement), dice on oak (roll), horn
(turn start, victory). Volume follows Master × Effects; music ducks 30 % under dialogs. The web
game's synthesised sounds are rendered to WAV as a starting point (plan §4.6), then replaced
one by one with better foley.

---

## 5. Layout of the game screen

### 5.1 Wide (16:9, 1920×1080 reference)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ [Lists cartouche]      ╞══╪══ banner pole with 4 player banners ══╪══╡  [⟲][¶][?][♪][⚙][⇥]│
│  Round 15 · Midnight    ▼Mazen▼  ▼Morrow▼  ▼Isolde▼  ▼Vex▼                        │
│  First to 10 ███▒▒      (lit = current; VP numeral on each)                      │
│  Longest Road · Vex 7          ┌──── Herald's ribbon: "Build & trade, then end   │
│  Largest Army · —              │      your turn (Space)" ────┐                   │
│                                                                                  │
│                       ╔══════════════════════════════════╗                       │
│ ¶ Herald (3 lines,    ║                                  ║        bank chest     │
│   map notes, expand)  ║      THE 3D ISLAND ON THE        ║        on the table   │
│ ¶ Vex built a road    ║         WAR TABLE (≥ 60 %)       ║                       │
│ ¶ You rolled 8        ║                                  ║                       │
│                       ╚══════════════════════════════════╝                       │
│                                                                                  │
│  ┌──────── Treasury: your cards fanned (real art) ───────┐  ┌─ Action board ───┐ │
│  │ [Lumber 1][Brick 1][Wool 3 +1][Grain 0][Ore 2]  ▓▓▓▒▒ 7│  │Build Cards Trade │ │
│  │ dev cards: [Knight][Year of Plenty]                    │  │[Road][Settlement]│ │
│  └────────────────────────────────────────────────────────┘  │[City][Dev card]  │ │
│                                                              │ (wax) END TURN ␣ │ │
│                                                              └──────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Top centre:** the banner pole with the players (§7.2). Under it the **Herald's ribbon**
  (§7.4), the only always-loud text.
- **Top left:** the **Lists** cartouche (round, time of day, race to N meter, claims). Compact,
  quiet.
- **Top right:** the **toolbar**: six round brass buttons (Undo, Chronicle, Rulebook, Sound,
  Settings, Leave).
- **Left edge, lower:** the **Herald** (log): last 3 lines as faint map notes; hover/focus or
  View button expands to the last 12; "Chronicle" opens the full log.
- **Bottom centre:** the **Treasury**: your resource cards fanned like a held hand, the hand-limit
  scale bar, your development cards to the right of them.
- **Bottom right:** the **Action board** (oak): Build / Cards / Trade tabs, and the big **wax-seal
  primary button** (Roll / End turn) with its key glyph.
- **On the table (3D):** the board, the dice, the bank chest with stock counts, the robber,
  harbours, and in hot-seat the curtain drawn across the hall.
- The board's camera keeps the island centred in the free area between these blocks (the 3D
  board already shifts for the side panel; extend it to all four edges).

### 5.2 Hierarchy, as sizes and light

| Tier | Elements | Treatment |
|---|---|---|
| 1 | Herald's ribbon, primary action (Roll/End turn), current player's banner, forced dialogs | Largest type, lit, the only things with glow |
| 2 | Treasury, Action board, legal spots on the board | Full contrast, no glow |
| 3 | Lists, Herald log, toolbar, other banners | 70 % brightness, smaller; brighten on hover/focus |

### 5.3 Mid (1280–1600 wide) and Steam Deck (1280×800, 16:10)

- Banners shrink to pennants (arms + VP + name), pole spans the top.
- Lists folds into a single chip row under the toolbar ("R15 · Midnight · First to 10 ▓▓▒").
- Herald collapses to one line; View button opens it.
- Treasury and Action board merge into one bottom bar: cards left, tabs and seal button right.
- Deck: everything reachable by gamepad (§9); touch also works (tap = click, drag = turn table).

### 5.4 Ultrawide

Chrome stays in a centred 16:9 band; the hall (torches, windows, columns) fills the sides. The
table camera widens its field of view slightly so the island stays the same size.

---

## 6. The hall scene (behind every screen)

A real 3D level replaces the engine's empty Entry map: `Content/Maps/Hall` built by script.

- **Architecture:** stone walls (modular blocks, per-block colour variation), pillars, a ceiling
  vault fading to black, two tall windows with moonlight and stars, a stone floor with a rug under
  the table. Modelled in Blender by script (`assets/blender/hall.py`), imported like the island
  models.
- **Light:** 2–4 torches (point lights with flicker driven by `MPC_Hall`, emissive flame cards,
  smoke), candles on the table, moonlight through the windows; Lumen GI and reflections; a slight
  volumetric haze in the torch cones.
- **Banners in the hall:** decorative 3D cloth banners on the walls (tinctures, and the players'
  colours in a game). In the menu the **menu banners themselves are 3D cloth on a real pole**
  (§7.1).
- **The war table:** the existing oak table and island; candles, a few props (coin stack, quill and
  inkpot, rolled maps) from the props set.
- **Cameras:** one camera per screen state (menu wide shot, lobby, table overhead, victory
  close-up) with smooth blends between them. The menu is a slow push-in on the hall; Play moves
  the camera to the table.
- **Time of day:** in a game, the windows go from dusk to midnight to dawn with the rounds (the
  rules' time stages); torches brighten at night.
- **Fallback:** Lite graphics swaps Lumen for baked-looking static lighting and fewer torches;
  the layout never changes.

---

## 7. Components (HallKit), each with anatomy, states and behaviour

Every component exists in the **UI Gallery** map with all its states (§11).

### 7.1 Menu banners (3D) and the banner pole

- **Pole:** turned dark wood, brass bands every ~1.4 m, spear-tip finials, iron wall brackets with
  chains. 3D model.
- **Banner (3D cloth):** straight top on rings that sit exactly on the pole's centre line, slightly
  curved sides, swallowtail bottom (notch rises 30 % of the width), gold thread border, fringe and
  two tassels, the charge (icon) in a gold roundel, and a **parchment label ribbon** laid across
  at ~58 % height, wider than the cloth with folded tails. The label is real UI text projected
  onto the ribbon (widget component), so it stays crisp and translatable.
- **Cloth:** Chaos Cloth or a vertex-shader sway; reacts to a gentle draft and to focus (a ripple).
- **States:** idle; hover/focus (lifts, ribbon brightens, cloth ripple, flap sound); pressed
  (banner swings back); lit (Play: warm glow, torchlight on it); disabled (desaturated, no
  ripple).
- **Skyline rule** (from the web brief): banners symmetric, tallest in the centre; when Continue
  is missing, drop Continue and the outermost banner on the other side and recompute heights; never
  leave a hole. Rejoin is a sealed letter pinned above the pole, not an extra banner.

### 7.2 Player banners (in game)

- 2D lit cloth (`M_UI_Cloth`) hanging from a 2D pole across the top, 130 × 180 at 1080p.
- **Content:** coat of arms (player colour + sigil, §7.13) → **VP numeral** (UnifrakturCook, 34 px,
  gold with dark outline) between arms and ribbon → name ribbon ("Mazen · you"). Never in the
  swallowtail notch.
- **Hidden VP** for you: a small "+1" wax seal at the numeral's shoulder.
- **States:** current (lit, longer by 12 px, glow, ripple when the turn starts); next up (a
  small "Next" tab on the ring); thinking (a slow ink dot animation on the ribbon for bots);
  away/autopilot online (desaturated, iron "away" tag); hot-seat hidden (arms visible, numbers
  hidden until reveal where the rules hide them).
- **Focus/hover:** a chart cartouche drops under the banner: cards in hand, settlements, cities,
  roads, knights, longest road length, development cards (count), with icons *and* words; and the
  player's pieces on the board light up.

### 7.3 The Lists (top left)

A small vellum cartouche: "Round XV · Midnight" (with a sun/moon mark), "First to 10" with a
gold meter of the leader's progress, then the two **claims**: Longest Road and Largest Army, each
with holder's arms and length/count or "Needs 5+ · best 3" and a thin progress rule. A claim
changing hands stamps the new holder's arms with a seal sound.

### 7.4 The Herald's ribbon (instruction)

A long parchment ribbon with folded tails under the banners. One sentence, the exact texts of
`CATAN_NIGHT_2D_PROMPT.md` §6.5 (with the key glyph inline: "Roll the dice ␣ — or play a Knight
first"). Changes ink in. It is also the screen-reader announcement. When nothing is asked of you
it dims to tier 3 ("Morrow is thinking…").

### 7.5 Treasury (your hand)

- **Resource cards** with the real art (`apps/web/public/art/cards/*.webp`, imported at full
  resolution), fanned slightly, each with the count in a parchment corner and the name under it.
  Zero = card face down, dimmed, count 0 still shown.
- **"+N" wax seal** stamps on a card gained this turn; "−N" ink tag on spent.
- **Cost preview:** hovering a build plaque lifts the cards it needs: green ink tick on what you
  have, rubric cross on what's missing.
- **Hand-limit scale bar** (Sea Chart meter 0–12 with the 7 marked in rubric): "3 to the limit" /
  "A 7 would cost you 4 cards" (warn colour plus the robber mark).
- **Hold to reveal** (setting): cards face down until you hold the eye button / LT.
- **Development cards:** small cards to the right with art; "New · next turn" tab on cards bought
  this turn; click opens the card's decree (details) with Play.

### 7.6 Action board (bottom right)

An oak board with iron corners and three **cloth tabs** hanging from its top edge: **Build**,
**Cards (n)**, **Trade**. The selected tab hangs longer and is lit.

- **Build:** a 2 × 2 grid of brass-framed plaques (Road, Settlement, City, Dev. card), each with
  the piece rendered in 3D (live thumbnail of the real model in your colour), the cost as small real
  card art with ticks/crosses, "N left", and one status word: **Build** / **Buy** (ok ink),
  **Esc to cancel** (gold, while placing), or the reason ("2 short", "None left", "No spot", "Not
  now"). Never scrolls.
- **Cards:** your development cards as rows with art, name ×N, rules text and Play (or the
  reason); the **Played fan** below (face-up cards overlapping, hover lifts).
- **Trade:** a **Bill of Exchange** on parchment with two sub-tabs, **Bank** and **Players**.
  - Bank: Give row (rates 4:1 / 3:1 / 2:1 in gold where a harbour helps), Get row with bank stock,
    a stepper, and the primary button "8 Wool → 2 Ore" with card art.
  - Players: Give / Want rows of card cells (tap to add, small "−" seal to remove), **To:** All or
    one or more players' arms, Offer. While your offer is out: "Offer out: waiting for …" and a
    red Withdraw seal.
- **Primary button:** a large wax seal with "Roll" or "End turn" and the key/gamepad glyph; under
  it "Next up [arms] Name" and the turn timer as a small hourglass that runs (pulses warn ≤ 10 s).

### 7.7 Decree (dialog)

Parchment sheet with a blackletter title in rubric-dark, optional arms of whoever it concerns,
dotted ink dividers, actions in a row: wax-seal primary, paper secondaries. It slides in from the
right (or left, away from the relevant board area) onto a lectern edge and **never covers the
island's centre**; if the dialog is about a place (robber hex, rob victim), that place stays
visible and highlighted. Forced decrees (discard, rob, offer to you) can't be dismissed; others
close with Esc/B. Focus is trapped and returned.

### 7.8 Map note (tooltip)

A small paper slip with a dashed ink leader line to what it describes (a hex, a harbour, a piece, a
button). Appears after 300 ms hover or immediately on gamepad focus. Hex note: **Produces** (art +
name) · number with odds ("8 · 5/36 · 13.9 % per roll") · "Blocked by the robber" · "Settled by"
arms.

### 7.9 Herald's slip (toast)

A narrow parchment slip that slides up from the bottom centre with an icon seal (good: ok-ink
tick, bad: rubric cross, gold: crown, info: scroll) and a burning-fuse line that shortens over its
life (2.6 s errors, 3.4 s others). Max two at once; they stack.

### 7.10 Brass buttons, plaques, paper buttons, wax seals

- **Round brass icon button** (toolbar): 56 px, engraved icon, map-note tooltip with the action
  and shortcut.
- **Brass/iron plaque** (secondary actions in menus and lobby): rectangular, riveted.
- **Paper button** (dialog secondaries): parchment with ink label.
- **Wax-seal button** (confirm/primary): seal + text label to its right; the seal is never the only
  label.
- **Danger**: rubric ink and a rubric seal; always paired with a confirmation where data is lost.

### 7.11 Inputs on parchment

Ink underline text field, check box (inked box with a quill tick), segmented control (ink tabs),
select (unrolling list), stepper (− count +), slider (a chart scale with a brass slider), banner
tabs on a pole for section switching (Settings). All with focus rings (a warm glow line), disabled
states (faded ink) and gamepad behaviour.

### 7.12 Bone dice and the dice result

Physical bone dice (3D, from the SVG faces' design) thrown onto the table from the current
player's side; on rest, a small parchment plaque rises above them: "Mazen **8**" (a 7 in rubric,
and the dice tinted red). A "last roll" pair stays at the table's edge until the next roll.

### 7.13 Coats of arms

Heater shield: player colour field, gold rim, sigil charge (Skull, Moon, Eye, Thorn) from SDF
art. Used at 16, 24, 32, 64, 128 px and on 3D pieces' banners. Generated by one material with
parameters (colour, sigil index), so every size is crisp.

### 7.14 Resource and card art

Resource cards and development cards use the owner's illustrations (`public/art/cards`), framed
by a printed-card border (thin gold rule, name plate). Small sizes crop to the illustration's
centre (no icon substitution, per the web rules).

### 7.15 Loading and waiting

A torch-lit hourglass (sand runs) or a torch flame for loading; "Finding the table…" with three
ink dots. Never a bare spinner.

---

## 8. Every screen, specified

Labels, texts and rules are those of `design/CATAN_NIGHT_2D_PROMPT.md`; only the presentation
changes. For each: layout, Royal Court and Sea Chart elements, states, and what's better than the
web version.

### 8.1 Boot, splash, loading

- Studio/engine splash → the hall fades up from black as torches ignite one by one (sound), the
  title inks onto the title ribbon. First launch: a short settings prompt (language, UI scale, text
  size, reduce motion) on a chart sheet.
- **Better:** the menu *is* the place you'll play in; no static screen.

### 8.2 Title (main menu)

- **Scene:** the hall, wide shot, slow push-in. Title "Catnight" (final name from gate 0) in
  blackletter with the crest between the words, ribbon "Trade · Build · Settle".
- **Menu:** 3D banners on the pole, symmetric skyline, Play lit and tallest in the centre:
  Settings, Character, **Play**, My kingdom, How to play (+ Continue when a save exists, per the
  skyline rule). Each banner has a 2–4 word gloss ("Muster a new table").
- **Rejoin:** a sealed letter pinned above the pole: "A summons: room HEARTH-66 awaits" with a
  Rejoin seal.
- **Profile plaque** bottom left (arms, name, blazon "Red, a skull Or"); click → Character.
- **Bottom right:** sound brass button; Quit as an iron plaque.
- **Gamepad:** left/right moves between banners, A opens, the camera eases toward the focused
  banner.
- **Better:** real cloth, real torchlight, a living table behind the banners with a game in
  progress (bots play quietly on the table in the background).

### 8.3 Play (local game setup, current Unreal "New game")

- Camera moves to the table. Left: **seat banners** on a pole (3 or 4), each with arms, name
  ribbon and under it a small oak panel: **Person on this device / Bot (Easy, Medium, Hard)** as an
  ink segmented control, the name field, colour and sigil choice (when that seat is a person).
- Right: **Articles of the Game** on a chart sheet: Victory at (stepper with big numeral), First
  player (Dice roll-off / Seat 1), Board layout (Balanced / Fully random / Beginner board), Seed
  (ink field + reroll quill), and a **live preview**: the island on the table rebuilds as you
  change the seed or layout (the real 3D board, not a thumbnail).
- Bottom: problem line (rubric) and **Start the game** wax seal.
- **Better:** you see the actual island you'll play before you start.

### 8.4 Online: host, join, lobby, waiting room (phase 5)

- **Host:** seat banners on the pole with per-seat **Invite / Bot / This device** control; a
  tilted **letter of summons** with the room code in blackletter, Copy code (and Invite Steam
  friends) and a wax seal; states: opening a room, ready, copied, offline ("Playing on this
  device").
- **Join:** a letter with a wide ink field for the code (WORD-00), Join seal; "Finding the
  table…"; failure decree "Try another code".
- **Waiting room:** read-only banners, the rules on a chart sheet, "Waiting for <host> to start"
  as a herald's slip, Leave table.
- Steam: friends list invite, rich presence; codes stay for non-friends.
- **Better:** joining players' banners unfurl onto the pole as they arrive.

### 8.5 The game screen

Layout §5. Phase-by-phase behaviour:

| Phase | Ribbon | What else changes |
|---|---|---|
| Roll-off | "Who shall go first?" | Decree with each player's dice thrown in turn on the table; ties re-roll; "Name goes first"; **Start setup** seal |
| Setup | "Place your first Settlement" / "… second … gives resources at once" / "Build a Road from your new Settlement" | Legal corners/edges glow; ghost piece on hover; **rookie map note** with the setup tip; the Action board shows only what's relevant |
| Roll | "Roll the dice ␣ — or play a Knight first" | Primary seal = Roll; playable Knight highlighted in the Cards tab |
| Production | — | Producing hexes pulse once; cards fly to each player's banner and to your hand |
| Discard (7) | "Discard N cards" / "Waiting for X to discard" | Forced decree (§8.6) |
| Robber | "Move the robber — click any other hex" | Robber lifts off and follows the pointer/gamepad cursor; hex notes show what each hex would block |
| Steal | "Choose whom to rob" | Forced decree with victims' arms and card counts |
| Main | "Build & trade, then end your turn ␣" | Build plaques ready; primary seal = End turn |
| Road Building | "Build 2 free Roads (Road Building)" | Free road ghosts, counter "1 of 2" |
| Trade (yours) | "Waiting for X to answer the offer" | Bill of Exchange shows the offer and Withdraw |
| Trade (to you) | "X offers you a trade" | Forced decree §8.6 |
| Bot turn | "X is thinking…" (tier 3) | Bot's banner thinking dots; camera may follow its placements gently |
| Hot-seat handoff | "Pass the device to X" | The curtain (§8.8) |
| Duel (online) | "X challenges you to a duel. Enter the 3D walk!" | The 3D-walk plaque pulses |
| End | "X wins!" | Victory (§8.9) |

Also on the game screen: placement ghosts, "show why" map notes on blocked corners (setting),
the 2D chart / 3D table toggle (the flat chart is the accessibility/clarity view and the phone of
this game), connection plaque (online), turn timer.

### 8.6 Decrees during play

| Decree | Content and better-than-web |
|---|---|
| **Who shall go first?** | Dice physically rolled per player on the table, results inked in a column; tie rounds; Start setup seal. |
| **Discard N cards** (forced) | "A 7 was rolled and you hold 9 cards. Give up half to the bank." Your cards as real art with − / + under each, N wax-seal pips filling as you choose, "Pick 1 more", Discard seal enabled when exact. Discarded cards fly to the bank chest. |
| **Choose whom to rob** (forced) | Victims' arms, names, card counts; the robber's hex stays visible and lit; picking one makes a card fly face-down from their banner to your hand, then flip. |
| **A Bargain Offered** (forced, to you) | Sender's arms, "Morrow proposes 2 Wool for 1 Ore", **You receive** (ok ink) ⇄ **You give** (rubric) with real card art, your hand line, Accept (wax seal; disabled with "You lack the cards they ask for."), Counter, Decline. |
| **Counter** | Bill of Exchange with give/want steppers prefilled from the offer; Send counter seal; Back. |
| **Year of Plenty** | Five resource cards with bank counts; pick two (chips under "Chosen:"); Invoke seal. |
| **Monopoly** | Five resource cards; choose one; the cards fly in from every banner. |
| **Man up** (online) | Human opponents' arms; "The board pauses while you two fight in the 3D walk…". |
| **Card details** | Big card art, rules text, italic flavour line; Play seal when playable. |
| **Chronicle** | A long chart scroll: search, filter chips per player (in their colours), round tags ("R4"), every event line with arms and card art, Export (record). Opens from the left like unrolling a scroll. |
| **Leave this game?** | Local: Main menu / New game… / Restart same seed / Cancel, with the line about Continue. Online: Leave game (danger) / Stay. |

### 8.7 Map notes and slips in play

Hex note, harbour note ("3:1 harbour — your Settlement at … uses it"), piece note (owner, what it
produces), rookie tips (dismissible, a map note with a small "×" seal), toasts for refusals
("Roll the dice first", "Not enough resources for a City", "No place to build a Settlement").

### 8.8 Hot-seat curtain

A heavy cloth curtain is drawn across the hall (3D cloth, sound), hiding the table and hands; on it
the next player's large banner with arms, "Pass the device", "to **Name**", the reason line, and a
wax seal "I am Name — reveal". During a trade: "Morrow: withdraw the offer". Survives reloads
(state-driven, already in the match code).

### 8.9 Victory

Camera swings to the winner's side of the table; the winner's banner unfurls large and lit
above a **chart sheet** with "Name wins!" in blackletter, "after 14 rounds, with 10 points", the
**Final reckoning** table (sorted by total; Settlements, Cities ×2, Longest Road, Largest Army,
Victory Point cards, Total; winner's row gold), **Rolls of fate** (bar chart 2–12; 7 rubric, 6/8
warm), **Spoils** (resources gained by type, trades, cards stolen per player), and seals: Rematch
(same seed) / New game / Main menu. A compass rose decorates the sheet's corner. Embers rise,
horns sound. Data comes straight from the match state (the web's capture once showed a winner with
fewer points than another player: the table must always be consistent with `winner`).

### 8.10 Settings

Banner tabs on a pole: **Gameplay**, **Board**, **Sound**, **Access**, **Controls** (new: key and
button rebinding). Each tab a chart sheet with parchment controls and a live preview area (compass
rose when nothing to preview). Contents: everything in the web Settings (§9 of the 2D prompt) plus:
text size, high contrast, subtitles for horns/voice, camera sensitivity and invert, Steam Deck
preset, language. Footer: Done seal, Restore defaults paper button.

### 8.11 How to Play

An open book on a lectern in the hall (camera moves to it): left page chapter list (¶ Goal, The
board, Setup, A turn, Costs, Rolling a 7, Trade, Development cards, Special cards, Keys), right
page content with small illustrations (rendered from the real models), turn pages with
LB/RB. Costs table with card art. **Better:** a "Show me" button on some chapters that demonstrates
on the table (e.g. the distance rule with ghost pieces).

### 8.12 Character and My kingdom

- **Character:** the knight on a turntable in a lit corner of the hall; left: a large banner
  preview of your arms; right: parchment controls for skin, hair, hair colour, beard, outfit, helm,
  cape, name, colour, sigil. Changes apply live on the model.
- **My kingdom:** the camera goes into a cottage/hall room; the ten furnishing families with
  colour swatches, previewed in place in the real room.

### 8.13 Pause (in game)

Esc / Menu button: the hall dims, a decree "The game is paused" (local) with Resume, Settings, How
to play, Save and quit to menu, Quit to desktop. Online: no pause, same menu without pausing.

### 8.14 Island walk HUD (phase 4)

The web kept the old graphite look for the walk's HUD; here it joins Hall & Chart, lighter:
minimap as a small round chart with a compass ring and ink marks (island/nearby toggle), health as
a heraldic shield that cracks, weapon slots as two small plaques (1 bare hands, 2 sword)
with glyphs, context hints as map notes ("E —
Open the chest"), duel banner across the top when duelling. Minimal, edges only.

### 8.15 Errors and connection

Connection plaque (iron, top centre): "Connection lost — reconnecting…" (pulsing torch) / lost with
Main menu. Error screen: a torn decree with the message and Return to the hall. Never a raw engine
message.

---

## 9. Input and focus

| Action | Mouse/keys | Gamepad (Xbox names; Deck same) |
|---|---|---|
| Move focus | Tab / arrows | D-pad / left stick |
| Confirm | Click / Enter / Space | A |
| Back / cancel | Esc / right-click | B |
| Primary (Roll / End turn) | Space | Y (hold 0.4 s for End turn to avoid accidents) |
| Board cursor | Mouse | Left stick moves a cursor ring on the table, snapping to legal spots |
| Cycle legal spots | ← → | LB / RB |
| Turn / tilt table | Right-drag | Right stick |
| Zoom | Wheel | LT / RT |
| Switch zone (Board → Hand → Actions → Banners) | F6 | View button cycles; or a radial on hold |
| Chronicle | L | View (tap) |
| Pause menu | Esc | Menu |
| Hold to reveal hand | Hold H | Hold LT when the hand is focused |

- **CommonUI** activatable stacks: Menu, Game, Dialog, Modal layers; input is routed to the top
  layer; back/confirm handled by the framework; glyphs from Common Input (keyboard, Xbox, PS,
  Switch Pro, Steam Deck).
- Focus is always visible (warm glow line), never lost after a rebuild (the current Slate table
  already moves focus to the main button; keep that behaviour).
- Every action reachable in ≤ 3 presses from the default focus.

---

## 10. How to build it in Unreal

### 10.1 Architecture

- **C++ first, no hand-edited widget blueprints.** Agents can't author binary `.uasset` widgets
  reliably, so:
  - HallKit components are C++ Slate widgets (`SHcBanner`, `SHcRibbon`, `SHcSeal`, `SHcPlaque`,
    `SHcDecree`, `SHcChartSheet`, `SHcCartouche`, `SHcMapNote`, `SHcSlip`, `SHcScaleBar`,
    `SHcStepper`, `SHcArms`, `SHcCard`, `SHcTabs`, `SHcSegmented`, `SHcField`, `SHcSlider`…) wrapped
    as `UWidget`s where CommonUI needs them.
  - Screens are `UCommonActivatableWidget` subclasses in C++ that build their Slate content in
    `RebuildWidget`.
  - Materials, textures, fonts and the hall level are generated by scripts (Python in Unreal,
    Blender Python, Node/fontTools), like `Tools/import_models.py` today. `pnpm catnight:import`
    rebuilds them; outputs under `/Game/Generated` stay git-ignored until Git LFS exists.
- **Theme** in one place: `UCatnightTheme` (data asset made by script) + `MPC_Hall`; components
  never hard-code colours or sizes.
- **Text** in a string table (`ST_Catnight`), keys mirroring `apps/web/src/lexicon.ts`; no literal
  player-facing text in widgets (the current `Lexicon.cpp` becomes the string table's source).
- **Events, not polling.** The match emits events (already JSON); a `UCatnightPresenter` turns them
  into UI events (log line, toast, sound, animation, announcement), as the web's `advance()` did.
  Widgets subscribe; nothing rebuilds the whole panel every change (the current Slate table does:
  replace it).
- **Diegetic parts** (3D banners, dice, bank chest, curtain, lectern book) are actors in the hall
  level driven by the same presenter.
- **Performance:** invalidation boxes and retainer panels for static chrome; texture atlases;
  material instances, not unique materials; UI ≤ 1.5 ms GPU at 1080p and ≤ 2.5 ms on Deck; no
  per-frame layout of the log or hand.

### 10.2 Asset sources

| Asset | Source |
|---|---|
| Ornament shapes, banner anatomy, dice faces, heraldic charges | `design/hall-chart/assets/*.svg` → rasterised atlas (4×) and SDFs by script |
| Paper, oak, stone, weave textures | `design/hall-chart/assets/textures/*` as detail layers; macro variation procedural in the materials |
| Card art | `apps/web/public/art/cards/*.webp` (owner's illustrations) → imported at full size |
| Icons | New engraved icon family (vector source in `apps/catnight/SourceArt/Icons/*.svg`, committed) |
| 3D: pole, torch, candles, seals, dice, lectern, book, chest, curtain, hall architecture | Blender scripts in `assets/blender/` (same pipeline as the island) |
| Fonts | OFL TTFs + licences |
| Sounds | Rendered from the web synth first; then recorded/foley replacements |

### 10.3 What exists already (to reuse or replace)

- `apps/catnight/Source/Catnight/Private/Table/STable.*`, `Ui/SCatnightRoot.*`, `Ui/CatnightUi.*`:
  plain Slate placeholders with every action wired and keyboard/gamepad focus. **Keep the logic**
  (what is legal when, which action each control sends), replace the presentation screen by screen.
- `Board/CatnightBoardActor.*` and `Table/BoardView.h`: the 3D table, picking, camera. The new HUD
  talks to it through `FCatnightBoardView`.
- `FCatnightMatch`: state, record, autosave, undo, hot-seat viewer. Unchanged.

---

## 11. Quality bar and how we check it

### 11.1 The UI Gallery

A map `Content/Maps/UIGallery` (built by script) that shows **every component in every state** on
the hall background, plus **every screen** with fixture states (setup, roll, discard, robber,
offer, counter, victory, curtain, settings tabs…), selectable with `-CatnightGallery=<page>`.
Automated screenshots of all pages at 1920×1080, 2560×1440, 1280×800 and 3440×1440, light and
Frostbound themes, High contrast, Reduce motion → `apps/catnight/validation/ui/`.

### 11.2 Checks

- **Contrast:** measured in the gallery for every text style on its real background (≥ 4.5:1 body).
- **Size:** no rendered text below the minimums of §4.2 at any test resolution.
- **Board share:** the island's on-screen bounding box ≥ 60 % of the free area at every layout.
- **Focus:** an automation test walks every screen with simulated gamepad input and checks that
  focus is never lost and every action is reachable.
- **Performance:** `stat slate` / Insights on the busiest state; budgets of §10.1.
- **Consistency with rules:** victory table and banners are derived from the state in one place
  (unit tested against fixture games).

### 11.3 The "not ass" checklist (every screen must pass)

1. Does the light come from the hall (torch side), and do brass/wax/paper react to it?
2. Is there one obvious thing to do, and is it the biggest/lit thing?
3. Can you read every number from 2 m on a TV and on a Deck?
4. Is the island at least 60 % and uncovered in its centre?
5. Are icons all from the one engraved family?
6. Does every press have motion + sound, and does reduce motion keep the result?
7. Is any flat colour block bigger than 64 px? (It must not be.)
8. Is any texture visibly repeating? (It must not be.)
9. Does it work with only a gamepad?
10. Would it look at home next to the 3D island in one screenshot?

---

## 12. Order of work (milestones)

Each milestone ends with gallery screenshots, the checklist passed, tests green, a commit (push
only with the owner's yes).

| # | Milestone | Done when |
|---|---|---|
| UI-0 | **Foundations** | Fonts converted and imported with licences; `UCatnightTheme`, `MPC_Hall`; string table generated from the lexicon; CommonUI + Common Input set up with engraved glyphs; UIGallery map and screenshot script |
| UI-1 | **Materials and surfaces** | `M_UI_Parchment/Cloth/Brass/Wax/Oak/Ink/Glow` by script; chart sheet, cartouche, oak panel, plaques, seals rendered in the gallery in all states |
| UI-2 | **The hall** | Hall level by script (Blender architecture, torches with flicker, moonlight, table, props), cameras per screen; menu push-in; Lite fallback |
| UI-3 | **Core components** | Banners (2D + 3D cloth), pole, ribbon, arms, cards, scale bar, stepper, tabs, map note, slip, decree, inputs; all states + gamepad in the gallery |
| UI-4 | **Title + Play setup** | §8.2 and §8.3 replace `SCatnightRoot`'s title and new-game screens; live island preview |
| UI-5 | **Game HUD** | §5 layout, banners, Lists, ribbon, Herald, Treasury, Action board (Build/Cards/Trade), toolbar, dice on the table, bank chest; presenter-driven updates; replaces `STable` |
| UI-6 | **Decrees and curtain** | Every decree of §8.6, the curtain §8.8, map notes and slips §8.7 |
| UI-7 | **Victory, Settings, How to Play, Pause** | §8.9–8.13 (Character and My kingdom wait for the knight and rooms in phase 4) |
| UI-8 | **Motion and sound pass** | §4.6 and §4.7 complete; reduce motion verified |
| UI-9 | **Layouts and accessibility** | Mid, Deck, ultrawide, UI scale, text size, high contrast, rebinding, colour-blind mode; Deck test |
| UI-10 | **Online screens** | §8.4 with Steam (phase 5) |
| UI-11 | **Walk HUD** | §8.14 (phase 4) |

UI-0 to UI-3 can run beside the board work; UI-4 onward replaces the placeholder Slate screens one
by one without breaking the playable game (the old screen stays until its replacement passes the
checklist).

---

## 12a. Progress (2026-11-21, first pass)

Built in `apps/catnight/Source/Catnight/Private/Ui` and `Table/STableHud.cpp`, all from text and
scripts, the 3D war table untouched:

- **UI-0 foundations, partly:** the OFL fonts as TTF (`Tools/fonts.py` → `Content/Slate/Fonts`,
  licences included); the Hall & Chart art rasterised by `Tools/render_ui.mjs` (the kit's SVGs,
  banners recoloured per player, coats of arms from the web game's sigils, an engraved icon set,
  card art, glows and shadows → `Content/Slate/HallKit`); `HallStyle` loads them by path as
  dynamically loaded brushes; colour tokens of §4.1. Not yet: string table, CommonUI, glyph sets.
- **UI-1/UI-3 kit (`HallKit`):** paper sheets (parchment, vellum, letter) with neat line and shadow,
  oak boards with iron corners and title ribbons, the stone wall, ribbons, buttons (wax primary,
  brass plaque, paper, wax-seal, tabs, danger), steppers, decrees, slips, coats of arms, resource
  cards with "+N" seals, swaying banners with lit glow, flickering torches, the scale-bar meter.
  Images and lighting are baked art plus Slate effects for now; the material pass of §4.4 is still
  to do.
- **UI-4 title and setup:** the hall (stone, moonlit windows, torches, columns), crest and title,
  three menu banners on a pole (Settings, Play lit, How to play), Continue as a sealed letter, Quit
  plaque; "Muster a new table" with seat banners, oak seat boards and the Articles of the Game;
  How to Play as a parchment book; Settings (bot speed, start view, reduce motion; saved).
- **UI-5/UI-6 game HUD:** the Lists (round in Roman numerals, time of day, race meter, claims),
  player banners on a pole with score numerals, the Herald log, the instruction ribbon; the right
  column on the hall wall with toolbar plaques, Materials (was Thy Treasury), the orders board (Build plaques with
  costs and status, Cards, Trade with the bank and a bill of exchange) and the wax-seal Roll / End
  turn; forced choices as decrees in that column (discard, rob, offer, counter, Year of Plenty,
  Monopoly, placement help); the curtain, leave decree and victory chart (final reckoning, rolls of
  fate) full screen.
- **Checks:** `-CatnightScreen=gallery|rules|settings|new`, `-CatnightFixture=<moves>
  [-CatnightFixturePhase=main|roll|setup]` for real positions; screenshots in
  `apps/catnight/validation/ui/`.

Deviations, on purpose: the instruction ribbon sits at the bottom of the island (under the banners
it covered the island's top); Continue is the sealed letter rather than a fourth banner (the
skyline stays at three); decrees live in the right column, never over the island.

The integrated table-feedback pass adds carved 3D dice (a result-driven kinematic toss),
five-second painted construction, actual paid/blocked production markers and public vellum
hex notes (hover or I / gamepad X). The Lists include the dice result. Reduced motion uses the
same saved `FHallSettings` preference for Hall and board; QA overrides do not persist. See
`validation/table-feedback.json` for scope and evidence.

### Second pass (2026-11-21)

- **Sound (§4.7, UI-8 part):** `Tools/render_sfx.mjs` runs the web game's `synth.ts` recipes
  unchanged on an OfflineAudioContext in the repo's Chromium and writes WAVs to
  `Content/Slate/Sounds`, plus new UI foley in the same style (parchment, brass click, wax stamp,
  cloth, wooden tab, a hunting horn for your turn). `Ui/HallSound` plays them as procedural waves
  (no imported assets): every HallKit press by kind, banner hover/click, decrees arriving, and the
  match events as the web's `SOUND_FOR`. Settings → Effects 0–10.
- **Button prompts (§4.5, §9):** engraved glyphs rendered by `render_ui.mjs` (`glyphs/`: A/B/X/Y,
  LB/RB/LT/RT, sticks, Menu/View, keycaps, the mouse with the button in use). An input pre-processor
  tells pad from mouse and keys; `HallKit::Prompt`/`PromptHint` switch live. The hint row under the
  ribbon shows only what applies now. Pad: Y rolls / ends the turn, X undoes, View opens the Herald,
  triggers zoom (plus the existing shoulders, A, right stick, Menu).
- **Dice and card flights (§4.6):** `ACatnightHallActor` throws two bone dice across the sea off the
  island's lower right on every roll and leaves them on the rolled faces (reduce motion: placed);
  `SCardFlights` flies gained cards from the producing tiles (projected from the 3D table or the
  chart) into their places in Materials (was Thy Treasury), turning face up.
  After integration with the table-feedback branch, the board owns the single carved dice pair
  and its toss/production timing. The hall's optional dice are disabled in the integrated game.
- **The hall (UI-2, first part):** the same actor dresses the space round the war table:
  flagstones, a rug, oak legs, candles on the table's corners, stone walls with pillars, flickering
  torches and banners in the players' colours. Nothing in it casts shadows or reaches the island
  with its light, so the board looks exactly as before; Settings → The hall turns it off. Not yet:
  the Blender architecture, windows with moonlight, per-screen cameras and the menu push-in.
- **Torchlight on the column (§4.4, a first step):** a warm, flickering pool from above over the
  right column and shade at its foot. Real UI materials (`M_UI_*`) remain to do.
- **Playthrough by UI (§11.2 "focus" check, partly):** `-CatnightUiDrive=mouse|pad` plays the
  person's seats through the real controls with simulated input (`Table/UiDriver.cpp`) and logs
  what went through the UI. Mouse, one person and three bots: 137 of 137 moves through the UI (the
  table was turned twice when a spot lay under the Herald or the Lists). Pad, two people in
  hot-seat: 348 of 348, including 126 curtain reveals. In pad mode the driver puts focus on the
  button it wants before pressing A, so D-pad navigation between buttons is not covered.

### Readability pass (2026-11-21)

Every screen captured before and after (including each tab, the long Herald and the leave decree,
via `-CatnightTab`, `-CatnightFullLog`, `-CatnightLeave`). Fixed:

- **Type sizes (§4.2):** labels and body text raised to the plan's minimums (most were 13–17 px);
  `Hall::Label/Body/Italic` now have floors (17/16 px) so no call can go below them.
- **UI scale (§4.3):** the engine's default curve made a 720p window two-thirds size; the project's
  curve is 0.8 at 720p, 1.0 at 1080p, 1.33 at 1440p, 2.0 at 2160p.
- **Ribbons:** label text sat low and its lower half was cut by the ribbon's edge; it is now
  centred on the ribbon's face, and ribbons are only as wide as their name (they overlapped on the
  player pole). Names too long for their room shrink (`FitText`) instead of being cut.
- **Cut-off controls:** the bill of exchange's steppers were wider than their columns, the bank's
  rate buttons overflowed the paper, a decree's title ran off the paper, and a build card's name
  shared its line with the count. Steppers are compact and square, the bank is a table of equal
  cells, decree titles wrap, and build cards put each thing on its own line.
- **Hidden text:** the hand-limit meter's figures and marker were dark ink on dark oak; a banner's
  card count lay over the board under a swallowtail (now on a small dark plate).
- **Layout:** the top banners and the bottom ribbon move aside on narrow screens instead of covering
  the Lists or the Herald, and the hint row wraps. Buttons in decrees keep their own width (some
  stretched across the paper). The victory sheet is wider and its subtitle no longer breaks after two
  words. Keyboard and pad focus shows as a gold ring instead of Slate's blue box.
- **Paper:** the kit's paper tiles were not seamless (straight seams across big sheets); they are
  mirrored into 2×2 seamless tiles by `render_ui.mjs`.

### Day and night on the 3D table (2026-11-22)

- The table's light follows the game's clock (`Daytime.h`, a port of the web's `daytime.ts`, shared
  with the HUD's "Round II · Midday"): `ACatnightDaylightActor` owns the sun/moon, sky light, sky
  atmosphere, fog and an unbound post-process; the board actor no longer makes its own light. Keyed
  looks per hour (from the web walk's `daylight.ts`, retuned: lower sun, softer shadow edges, golden
  hours, lavender dusk, blue moonlight), an exposure held per hour so night reads as night, a gentle
  warm grade by day. From dusk to dawn a candle lamp hangs over the island and every settlement and
  city has lit windows. The light eases to each new hour over a couple of seconds (reduce motion:
  at once). Settings → Day and night (follow the game / always day); `-CatnightHour` for captures.
- Camera checked and fixed: a pad reports an axis only when it moves, so a held stick stopped
  turning the table; sticks, triggers and the new Q/E keys now move it by time. A right-drag released
  outside the window kept turning the table (capture lost now ends it). Trackpad scrolling zooms by
  its fraction. Home or a right-stick click brings back the starting view.

Next: real UI materials, the Blender hall and per-screen cameras, toasts, the
Chronicle scroll, CommonUI and focus navigation tests, string table, music, a Text size setting.

## 13. Decisions for the owner

1. **Final name** (gate 0): the title, crest and banners need it; "Catnight" is taken on Steam.
2. **3D menu banners** (real cloth in the hall) vs 2D lit banners: the plan assumes 3D for the
   menu and 2D for in-game players. Confirm.
3. **Walk HUD joins Hall & Chart** (§8.14) instead of keeping the web's graphite look. Confirm.
4. **Icons:** draw a new engraved family (recommended) or commission one.
5. **Concept frames first?** Paint 3–4 key frames (menu, game, decree, victory) before building, to
   lock the look. Recommended for UI-2/UI-5.
6. **Git LFS** before the hall's binary assets, or keep generating everything by script (current
   approach).
