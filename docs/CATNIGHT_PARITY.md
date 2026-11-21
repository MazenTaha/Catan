# Catnight parity: the browser game, rebuilt and better

The owner's bar (2026-11-21): **the Unreal game is the same game as the browser game, with every
feature kept, and clearly better in every part, the 3D most of all.** This list makes sure nothing
is lost. Each line names a browser feature (source: `docs/GAME_REPORT.md`,
`design/hall-chart/MIGRATION_CHECKLIST.md`, the code), what Unreal has today, and what "better"
means for it. Phases refer to `docs/UNREAL_NATIVE_PLAN.md` §5.

Status: **done** (in Unreal and tested), **part** (started), **to do**.

A feature counts as done only when it works in the packaged build, with a test or a screenshot as
proof. "Better" is never a filter or a blanket effect: it means more detail, better light, better
motion and feel, faster, and easier to read (DECISIONS #29–30 still hold).

## 1. Rules, bots and records

| Browser feature | Unreal today | Better in Unreal | Phase |
|---|---|---|---|
| Base rules: setup snake, distance rule, production, bank shortage, 7 → discard → robber → steal | **done**, 248/248 golden games match step by step | Same rules, proved identical | 1 |
| Roads, settlements, cities, supply 15/5/4, bank 19 each | **done** | — | 1 |
| Domestic trade: offers, counters, accept/decline; bank 4:1, 3:1, 2:1 harbours | **done**: offers to everyone or chosen players, counters | Hall & Chart bill of exchange | 2 → 3 |
| Development cards (25, +6 Man up with PvP), one per turn, not on the turn bought | **done** | — | 1 |
| Longest Road (≥5) and Largest Army (≥3), challenger must exceed | **done** | — | 1 |
| Victory target 8–14, checked on your own turn | **done** | — | 1 |
| Layouts balanced / random / beginner, seeds, no adjacent 6/8, 9 harbours | **done** | Seed preview in the new-game screen | 2 → 3 |
| First player by dice roll-off | **done** in rules | Roll-off shown with real 3D dice | 3 |
| Bots Easy / Medium / Hard (lookahead, road blocking, public-info hand estimates) | **done**, same moves as TypeScript | — | 1 |
| Arms: chest in a starting settlement, 5 bullets, health 100, kills, card debts, duel phase | **done** in rules | Played in 3D (§6) | 1 / 5 |
| Hot-seat privacy in state (`handoff`, `viewer`, `AckPassDevice`) | **done**: opaque curtain, `AckPassDevice` | Curtain in the lit hall | 2 → 3 |
| Records (`hexfall-record`: config + actions replay a game) | **done**: autosave after every action, Continue | Save slots, Steam Cloud, replay viewer | 2 → 6 |
| Undo (local, no randomness used) | **done** (tested) | Same limits | 2 |
| Turn timer (personal setting) | to do | Same | 3 |

## 2. Modes and starting a game

| Browser feature | Unreal today | Better in Unreal | Phase |
|---|---|---|---|
| Title: Play, Continue (with a save), Rejoin (online), How to play, Settings, Character, My kingdom, Quit | part: Continue, Play, Quit (How to play, Settings, Character, My kingdom to do) | Hall in real 3D with torchlight, the live board on the war table behind the menu | 2 → 3 |
| New game: 3/4 seats, each human / bot level, names, colour, sigil, target, first player, layout, seed + reroll | **done** except colour/sigil choice | Same choices, gamepad-friendly | 2 |
| Local versus bots | **done** | — | 2 |
| Hot-seat with pass-the-device curtain | **done** (tested, 181 hand-offs) | — | 2 |
| Online: host, room code, join, seats, fill bots, kick, start, rejoin token, 45 s autopilot | to do | Steam lobbies, friend invites, join from the friends list; codes kept | 4 |
| Leave dialog: Main menu / New game / Restart same seed / Cancel | **done** | — | 2 |
| Victory screen: winner, final reckoning, rolls of fate, spoils | part: winner, final reckoning, Play again (rolls of fate and spoils to do) | 3D victory moment on the table | 2 → 3 |

## 3. The table (2D board → 3D war table)

| Browser feature | Unreal today | Better in Unreal | Phase |
|---|---|---|---|
| 19 painted hexes with terrain scenery (forest, clay, pasture with sheep, wheat and windmills, mountains, desert ruin) | part: flat coloured hexes in Slate | **Real 3D miniature board** on an oak war table: modelled tiles with the island's own trees, wheat, rocks and buildings, sunlit with soft shadows, wind in the crops | 3 |
| Sea, turquoise shallows, foam, docks with badges, little boats | part: flat sea, harbour labels | Animated water with depth colour and foam, the Blender docks and boats bobbing | 3 |
| Ivory number tokens with pips, red 6/8 | part (drawn circles) | Carved tokens with engraved pips | 3 |
| Pieces: settlement, city, road, robber, player colours and sigils | part (flat shapes) | Modelled cottage, hall, bridge-road and hooded robber; colour and sigil on every piece; placement animation and dust | 3 |
| Legal targets on hover/click, keyboard focusable, show-why reasons | part: hover/click, arrows/shoulders + Enter/A (not hand-tested) | Glowing targets, gamepad cursor and stick snapping, reasons on hover | 2 → 3 |
| Hex tooltip (terrain, number, odds, owners) | to do | Same, as a map note | 3 |
| Zoom and pan | to do | Orbit, zoom, tilt the camera over the table; top-down 2D view kept for clarity | 3 |
| Dice roll overlay, flying gains, production highlights | to do | Physical bone dice rolling on the table; cards flying to banners | 3 |
| Time of day wash and label (rounds → Sunrise … Small hours) | to do | Real sun and moon over the hall's windows and the table | 3 |
| Walk layer: walkers and fights on the board | to do | Same markers in 3D | 4 / 5 |

## 4. The Hall & Chart interface

| Browser feature | Unreal today | Better in Unreal | Phase |
|---|---|---|---|
| Player banners on a pole (arms, VP, name ribbon, current, cards/pieces) | part: plain list | UMG banners with cloth motion | 3 |
| Instruction ribbon above the board (also the live region) | part: plain text | Same | 3 |
| The Lists: round, time, first to N + leader meter, Claims | part: plain text | Same | 3 |
| The Herald: recent log with arms and resource art, full Chronicle (search, filters, export) | part: plain log | Same | 3 |
| Thy Treasury: card art, +N seal, hold-to-reveal, hand-limit scale bar | part: plain counts | Real card art, cards fan in the hand | 3 |
| Build / Cards / Trade tabs, costs, N left, status words, played-card fan | part: plain buttons | Same, gamepad tabs | 3 |
| Trade: bank (rates, stock, stepper), players (counts, To, Offer), offer out + Withdraw | part: bank and offer-to-all | Same plus targeted offers | 2 → 3 |
| Dialogs: roll-off, discard, rob, offer arrives, counter, Year of Plenty, Monopoly, Man up target, card details | part: inline in the panel | Decree dialogs | 2 → 3 |
| Toolbar: undo, full log, rulebook, mute, settings, leave | to do | Same | 3 |
| Toasts (herald's slips), rookie tips, connection banner | to do | Same | 3 |
| How to Play book, Settings with banner tabs, Character, My kingdom | to do | Same | 3 |
| Layouts wide / mid / narrow, 44 px targets, UI scale | part (fixed layout) | Steam Deck 1280×800 first-class; DPI scaling | 3 |
| Themes Ember / Frostbound | to do | Same | 3 |

## 5. The 3D island walk

| Browser feature | Unreal today | Better in Unreal | Phase |
|---|---|---|---|
| The live island: every building and road from the match stands there | to do in Catnight; a static island prototype exists in `apps/unreal 5.8` (`Island_*` maps, 424 files) | Nanite and Lumen: real global light, far more vegetation, proper shadows, volumetric fog | 4 |
| Third-person knight over the shoulder, walk 5 / run 10 m/s with momentum, footfalls, dust | to do | Motion-matched or blended locomotion, camera collision, controller support | 4 |
| Horses: graze, mount with E, walk/trot/gallop 7/17 m/s | to do (Blender horse exists) | Proper animation blueprints | 4 |
| Enterable cottage, hall, mill with furnished rooms and hinged doors | to do (room plans in `buildings.json`) | Lit interiors with Lumen; doors with physics | 4 |
| Trees, shrubs, grass, flowers, wheat with wind; boulders, crags, clay banks, ruin | prototype island has foliage | Dense foliage with wind, distance fields, no pop-in | 4 |
| Sheep that graze, look, bleat; pasture horses | to do | Same, with real animation | 4 |
| Sky, clouds, sun/moon, stars, day stages from game progress | to do | Sky atmosphere, volumetric clouds, moonlight | 4 |
| Minimap (island / nearby, M), view cone, markers | to do | Same | 4 |
| Dive in mouse look; keys WASD, Shift, F, RMB guard, 1/2/3, E, M, Esc | to do | Plus gamepad, rebindable keys | 4 |
| Training dummy | to do | Same | 4 |
| Graphics Auto / Full / Lite, 3D resolution 100/75/50 % | to do | Unreal scalability, TSR/DLSS/FSR upscaling, Steam Deck preset | 4 |

## 6. Weapons, chest, combat, duels

| Browser feature | Unreal today | Better in Unreal | Phase |
|---|---|---|---|
| Weapon chest in a starting settlement (decoy in the other), juicy opening | rules done; `CatanAnimation` has chest clips | Full animated opening, particles, sound | 4 |
| Fists 10 / sword 25 / revolver 50 damage, health 100, 5 bullets per game | rules done | Hit reactions, ragdoll-lite knockback, hit-stop | 4 |
| Sword guard parries from the front | rules on the server side to port | Same, host-checked | 5 |
| Kill → victim respawns, killer steals a card or a debt | rules done | Same | 5 |
| Man up card: duel pauses the board; yield; 90 s away yields | rules done | Arena framing, duel camera | 5 |
| Online fights: poses at 10 Hz, host checks reach, rate, freshness, shot first | to do | Unreal replication with host checks | 5 |

## 7. Customisation

| Browser feature | Unreal today | Better in Unreal | Phase |
|---|---|---|---|
| Character: 6 skins, 6 hair styles, 7 hair colours, 4 beards, 8 outfits, 5 helms, 3 capes, live 3D preview | to do (Blender knight exists) | Same options on a lit turntable | 4 |
| My kingdom: 10 furnishing families × cottage/hall × 6 colours, 3D preview | to do | Same, shown in the real rooms | 4 |
| Profile name, colour, sigil; shared in lobbies | to do | Steam name by default | 2 / 5 |

## 8. Sound and music

| Browser feature | Unreal today | Better in Unreal | Phase |
|---|---|---|---|
| Synthesised SFX: dice, cards, build, trade, turn, victory, robber, sheep, attacks, shots, chest, footfalls by ground | to do | Rendered once to WAV (plan §4.6), then MetaSounds for variation; 3D spatial sound in the walk | 3 / 4 |
| Classical music (Mozart, Beethoven) on menus and the board only, fades in the walk | to do | Same pieces, rendered with a better piano | 3 |
| Master / SFX / music volume, mute | to do | Sound classes and mixes | 3 |

## 9. Settings and accessibility

| Browser feature | Unreal today | Better in Unreal | Phase |
|---|---|---|---|
| Reduce motion, colourblind glyphs, hand privacy, hold-to-reveal, rookie tips, show why, bot speed, UI scale, turn timer, theme | to do | Same, saved in `USaveGame` | 3 |
| Keyboard-operable targets, screen-reader announcements | part: keys and gamepad on the board; no screen reader | Gamepad everywhere; rebindable keys (new) | 2 → 3 |
| Saves: local versioned save, settings, profile | to do | Save slots, Steam Cloud | 2 / 6 |

## Order of work

1. **Finish phase 2** (now): seats, hot-seat curtain, save and continue, title and new-game screens,
   targeted offers, leave and victory screens, gamepad and keyboard on the board.
2. **Phase 3, the look:** the 3D war table and board, the Hall & Chart UI in UMG, audio. This moved
   ahead of online play so the game looks and sounds like the finished game early.
3. **Phase 4, the island walk (local):** migrate the island prototype, live buildings, knight,
   horses, rooms, chest, dummy, minimap, customisation.
4. **Phase 5, online through Steam:** lobbies, host as referee, redaction, rejoin, autopilot, live
   PvP and duels.
5. **Phase 6, release.**
