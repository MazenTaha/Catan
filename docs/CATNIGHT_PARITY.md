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

| Browser feature                                                                                 | Unreal today                                             | Better in Unreal                                   | Phase |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- | ----- |
| Base rules: setup snake, distance rule, production, bank shortage, 7 → discard → robber → steal | **done**, 248/248 golden games match step by step        | Same rules, proved identical                       | 1     |
| Roads, settlements, cities, supply 15/5/4, bank 19 each                                         | **done**                                                 | —                                                  | 1     |
| Domestic trade: offers, counters, accept/decline; bank 4:1, 3:1, 2:1 harbours                   | **done**: offers to everyone or chosen players, counters | Hall & Chart bill of exchange                      | 2 → 3 |
| Development cards (25, +6 Man up with PvP), one per turn, not on the turn bought                | **done**                                                 | —                                                  | 1     |
| Longest Road (≥5) and Largest Army (≥3), challenger must exceed                                 | **done**                                                 | —                                                  | 1     |
| Victory target 8–14, checked on your own turn                                                   | **done**                                                 | —                                                  | 1     |
| Layouts balanced / random / beginner, seeds, no adjacent 6/8, 9 harbours                        | **done**                                                 | Seed preview in the new-game screen                | 2 → 3 |
| First player by dice roll-off                                                                   | **done** in rules                                        | Clear 2D dice faces and total, recorded in the log | 3     |
| Bots Easy / Medium / Hard (lookahead, road blocking, public-info hand estimates)                | **done**, same moves as TypeScript                       | —                                                  | 1     |
| Arms: chest in a starting settlement, melee only, health 100, kills, card debts, duel phase     | **done** in rules                                        | Played in 3D (§6)                                  | 1 / 5 |
| Hot-seat privacy in state (`handoff`, `viewer`, `AckPassDevice`)                                | **done**: opaque curtain, `AckPassDevice`                | Curtain in the lit hall                            | 2 → 3 |
| Records (`hexfall-record`: config + actions replay a game)                                      | **done**: autosave after every action, Continue          | Save slots, Steam Cloud, replay viewer             | 2 → 6 |
| Undo (local, no randomness used)                                                                | **done** (tested)                                        | Same limits                                        | 2     |
| Turn timer (personal setting)                                                                   | to do                                                    | Same                                               | 3     |

## 2. Modes and starting a game

| Browser feature                                                                                                | Unreal today                                                                                                                 | Better in Unreal                                                                 | Phase |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----- |
| Title: Play, Continue (with a save), Rejoin (online), How to play, Settings, Character, My kingdom, Quit       | part: Hall & Chart Play/Continue/Quit, How to Play and saved basic Settings; Character, My kingdom and online Rejoin pending | Hall in real 3D with torchlight, the live board on the war table behind the menu | 2 → 3 |
| New game: 3/4 seats, each human / bot level, names, colour, sigil, target, first player, layout, seed + reroll | **done** except colour/sigil choice                                                                                          | Same choices, gamepad-friendly                                                   | 2     |
| Local versus bots                                                                                              | **done**                                                                                                                     | —                                                                                | 2     |
| Hot-seat with pass-the-device curtain                                                                          | **done** (tested, 181 hand-offs)                                                                                             | —                                                                                | 2     |
| Online: host, room code, join, seats, fill bots, kick, start, rejoin token, 45 s autopilot                     | to do                                                                                                                        | Steam lobbies, friend invites, join from the friends list; codes kept            | 4     |
| Leave dialog: Main menu / New game / Restart same seed / Cancel                                                | **done**                                                                                                                     | —                                                                                | 2     |
| Victory screen: winner, final reckoning, rolls of fate, spoils                                                 | part: winner, final reckoning, Play again (rolls of fate and spoils to do)                                                   | 3D victory moment on the table                                                   | 2 → 3 |

## 3. The table (2D board → 3D war table)

| Browser feature                                                                                                       | Unreal today                                                                                                                                                                                    | Better in Unreal                                                                                                                                                     | Phase |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 19 painted hexes with terrain scenery (forest, clay, pasture with sheep, wheat and windmills, mountains, desert ruin) | part: native 3D hexes and instanced Blender scenery, sun/shadows and cooked artwork verified in the Development package; crop wind pending                                                      | **Real 3D miniature board** on an oak war table: modelled tiles with the island's own trees, wheat, rocks and buildings, sunlit with soft shadows, wind in the crops | 3     |
| Sea, turquoise shallows, foam, docks with badges, little boats                                                        | part: shaded sea tray, sand shelves, modelled docks/boats and rate plaques; foam and boat motion pending                                                                                        | Animated water with depth colour and foam, the Blender docks and boats bobbing                                                                                       | 3     |
| Ivory number tokens with pips, red 6/8                                                                                | part: 3D ivory tokens, pips and red 6/8 rotate together toward the camera; engraving polish pending                                                                                             | Carved tokens with engraved pips                                                                                                                                     | 3     |
| Pieces: settlement, city, road, robber, player colours and sigils                                                     | part: owner-coloured cottages/halls face their strongest producing neighbour; five-second painted construction, scaffolding and dust; roads and robber present; bridge-roads and sigils pending | Modelled cottage, hall, bridge-road and hooded robber; colour and sigil on every piece; placement animation and dust                                                 | 3     |
| Legal targets on hover/click, keyboard focusable, show-why reasons                                                    | part: 3D hover/picking and glowing targets; projection/deprojection checked from three angles; keys/shoulders + Enter/A remain, real gamepad play pending                                       | Glowing targets, gamepad cursor and stick snapping, reasons on hover                                                                                                 | 2 → 3 |
| Hex tooltip (terrain, number, odds, owners)                                                                           | part: public parchment map note with terrain/resource, odds, production claims, robber and bank caveat; hover or I/left-stick click; final UI/hardware checks pending                           | Same, as a map note                                                                                                                                                  | 3     |
| Zoom and pan                                                                                                          | part: smoothed orbit/tilt by right or middle drag/right stick, wheel zoom and Flat view toggle; pan pending                                                                                     | Orbit, zoom, tilt the camera over the table; top-down 2D view kept for clarity                                                                                       | 3     |
| Dice roll overlay, flying gains, production highlights                                                                | part: one carved board-dice pair with result-driven toss, actual paid/blocked production markers, and gained cards flying into Materials; physics dice/camera nudge pending                     | Physical bone dice rolling on the table; cards flying to banners                                                                                                     | 3     |
| Time of day wash and label (rounds → Sunrise … Small hours)                                                           | part: game-clock-driven sun/moon, sky, fog, exposure, lamps and building windows                                                                                                                | Real sun and moon over the hall's windows and the table                                                                                                              | 3     |
| Walk layer: walkers and fights on the board                                                                           | to do                                                                                                                                                                                           | Same markers in 3D                                                                                                                                                   | 4 / 5 |

The first 3D-table milestone is verified in the native editor game and a cooked Windows
Development package (92 models, 156 generated asset packages, 50/50 targets from three angles).
`pnpm catnight:import` recreates its ignored artwork; see the native README. The actor, import
pipeline, shared board targets and Flat view toggle are in place. The hall round the table (flagstones,
rug, legs, candles, walls, torches, banners in the players' colours) is a separate
actor; the board actor owns the single dice pair and production markers. The hall actor never shadows or lights the island. Full games have been played through the UI with
simulated mouse clicks and gamepad keys (`-CatnightUiDrive`, every move of the person's seats through
the real controls); a hand playthrough with a physical mouse and controller is still open. The packaged
match tests cover 12 full games and hot-seat/save/undo; a rendered autoplay match reaches victory. Validation captures:
`apps/catnight/validation/board3d-*.png`. The next feedback milestone adds five-second
construction, carved dice, actual production markers and map notes, tested against the match.
The integrated Hall/UI first pass (`b4b988c`) supplies the surrounding HUD and shares its saved
reduce-motion setting; see `validation/table-feedback.json` and `docs/CATNIGHT_UI_PLAN.md` §12a.

## 4. The Hall & Chart interface

How each of these is designed and built in Unreal: `docs/CATNIGHT_UI_PLAN.md`.

| Browser feature                                                                                                | Unreal today                                                                  | Better in Unreal                             | Phase |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- | ----- |
| Player banners on a pole (arms, VP, name ribbon, current, cards/pieces)                                        | done (HallKit `SBanner`, swaying, lit when current)                           | UMG banners with cloth motion                | 3     |
| Instruction ribbon above the board (also the live region)                                                      | done (below the island; button prompts under it follow mouse/keys or pad)     | Same                                         | 3     |
| The Lists: round, time, first to N + leader meter, Claims                                                      | done                                                                          | Same                                         | 3     |
| The Herald: recent log with arms and resource art, full Chronicle (search, filters, export)                    | part: Herald with More/Less (L / View); Chronicle pending                     | Same                                         | 3     |
| Materials (was Thy Treasury): card art, +N seal, hold-to-reveal, hand-limit scale bar                          | part: card art, scale bar, cards flying in; hold-to-reveal pending            | Real card art, cards fan in the hand         | 3     |
| Build / Cards / Trade tabs, costs, N left, status words, played-card fan                                       | done                                                                          | Same, gamepad tabs                           | 3     |
| Trade: bank (rates, stock, stepper), players (counts, To, Offer), offer out + Withdraw                         | part: bank, targeted player offers and counters; visual treatment pending     | Same plus targeted offers                    | 2 → 3 |
| Dialogs: roll-off, discard, rob, offer arrives, counter, Year of Plenty, Monopoly, Man up target, card details | part: decrees in the right column (roll-off, Man up and card details pending) | Decree dialogs                               | 2 → 3 |
| Toolbar: undo, full log, rulebook, mute, settings, leave                                                       | part: Chart/3D, Undo, Menu                                                    | Same                                         | 3     |
| Toasts (herald's slips), rookie tips, connection banner                                                        | to do                                                                         | Same                                         | 3     |
| How to Play book, Settings with banner tabs, Character, My kingdom                                             | part: How to Play and Settings; Character and My kingdom wait for phase 4     | Same                                         | 3     |
| Layouts wide / mid / narrow, 44 px targets, UI scale                                                           | part (fixed layout)                                                           | Steam Deck 1280×800 first-class; DPI scaling | 3     |
| Themes Ember / Frostbound                                                                                      | to do                                                                         | Same                                         | 3     |

## 5. The 3D island walk

| Browser feature                                                                                                                    | Unreal today                                                                                                                                                                                                                                                          | Better in Unreal                                                                         | Phase |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----- |
| The live island: approximately 294 m wide, 38 work yards and connected trails; every building and road from the match stands there | part: Explore island opens the match's 19 tiles at about 520 × 563 m, with actual owner buildings/roads/harbours and deterministic instanced scenery; bots pause and Escape restores the same table                                                                   | Nanite and Lumen: real global light, far more vegetation, proper shadows, volumetric fog | 4     |
| Third-person knight over the shoulder, walk 2.4 / sprint 6.2 m/s, silent crouch 1.1 m/s, momentum, footfalls and dust              | part: rebuilt Blender knight, blended native loops, 1.6/5.5/0.85 m/s CharacterMovement, upright reach-driven gaits and terrain foot placement, crouch clearance and swept camera in both live island and practice yard; footfalls/dust pending                        | Blended locomotion, camera collision, controller support                                 | 4     |
| Horses: graze, mount with E, walk/gallop 5.5/12 m/s with matched rider grip and reins                                              | part: rebuilt skeletal horse in the live island and yard, synchronized rider/saddle and reins, supported mounting, safe dismount and 2/7 m/s gaits with smooth body geometry and blended joint weights; smoothed body alignment to slopes, per-leg IK/grazing pending | Native pose blending and physical clearance                                              | 4     |
| Enterable cottage, hall, mill with furnished rooms and hinged doors                                                                | to do: live-island cottages/halls/mills have closed collision shells; furnished rooms and hinged doors remain (reference plans in `buildings.json`)                                                                                                                   | Lit interiors with Lumen; doors with physics                                             | 4     |
| Trees, shrubs, grass, flowers, wheat with wind; boulders, crags, clay banks, ruin                                                  | part: roughly 19,700 original Blender scenery instances in six biomes, native HISM batches, bounded draw distance and clear walking corridors; wind/streaming refinement pending                                                                                      | Dense foliage with wind, distance fields, no pop-in                                      | 4     |
| Sheep that graze, look, bleat; pasture horses                                                                                      | part: original sheep placed in pastures; animated grazing, voices and ambient horse herds pending                                                                                                                                                                     | Same, with real animation                                                                | 4     |
| Sky, clouds, sun/moon, stars, day stages from game progress                                                                        | part: island atmosphere, warm sun, soft shadow fill and fog; clouds/moon/stars/live day stages pending                                                                                                                                                                | Sky atmosphere, volumetric clouds, moonlight                                             | 4     |
| Minimap (island / nearby, M), view cone, markers                                                                                   | part: native public biome chart, heading arrow and 100 m scale; nearby/expanded modes, M and markers pending                                                                                                                                                          | Same                                                                                     | 4     |
| Dive in mouse look; WASD, Shift, Ctrl/C crouch, F, RMB guard, 1 hands / 2 sword, E, M, Esc                                         | part: WASD/arrows, mouse orbit, Shift, Ctrl/C, E, wheel and Esc in live island and yard; combat/map modes/rebinding pending                                                                                                                                           | Plus gamepad, rebindable keys                                                            | 4     |
| Training dummy                                                                                                                     | to do                                                                                                                                                                                                                                                                 | Same                                                                                     | 4     |
| Graphics Auto / Full / Lite, 3D resolution 100/75/50 %                                                                             | to do                                                                                                                                                                                                                                                                 | Unreal scalability, TSR/DLSS/FSR upscaling, Steam Deck preset                            | 4     |

## 6. Weapons, chest, combat, duels

| Browser feature                                                               | Unreal today                                 | Better in Unreal                                | Phase |
| ----------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- | ----- |
| Weapon chest in a starting settlement (decoy in the other), juicy opening     | rules done; `CatanAnimation` has chest clips | Full animated opening, particles, sound         | 4     |
| Fists 10 / sword 25 damage, health 100                                        | rules done                                   | Hit reactions, ragdoll-lite knockback, hit-stop | 4     |
| Sword guard parries from the front                                            | rules on the server side to port             | Same, host-checked                              | 5     |
| Kill → victim respawns, killer steals a card or a debt                        | rules done                                   | Same                                            | 5     |
| Man up card: duel pauses the board; yield; 90 s away yields                   | rules done                                   | Arena framing, duel camera                      | 5     |
| Online fights: poses at 10 Hz, host checks reach, rate, freshness, shot first | to do                                        | Unreal replication with host checks             | 5     |

## 7. Customisation

| Browser feature                                                                                           | Unreal today                  | Better in Unreal                | Phase |
| --------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------- | ----- |
| Character: 6 skins, 6 hair styles, 7 hair colours, 4 beards, 8 outfits, 5 helms, 3 capes, live 3D preview | to do (Blender knight exists) | Same options on a lit turntable | 4     |
| My kingdom: 10 furnishing families × cottage/hall × 6 colours, 3D preview                                 | to do                         | Same, shown in the real rooms   | 4     |
| Profile name, colour, sigil; shared in lobbies                                                            | to do                         | Steam name by default           | 2 / 5 |

## 8. Sound and music

| Browser feature                                                                                                      | Unreal today                                                                                                                                                                                     | Better in Unreal                                                                              | Phase |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ----- |
| Synthesised SFX: dice, cards, build, trade, turn, victory, robber, sheep, attacks, shots, chest, footfalls by ground | part: the table's sounds rendered from `synth.ts` to WAV (`Tools/render_sfx.mjs`) plus UI foley (parchment, brass, wax, cloth, horn), played on events and presses; walk sounds wait for phase 4 | Rendered once to WAV (plan §4.6), then MetaSounds for variation; 3D spatial sound in the walk | 3 / 4 |
| Classical music (Mozart, Beethoven) on menus and the board only, fades in the walk                                   | to do                                                                                                                                                                                            | Same pieces, rendered with a better piano                                                     | 3     |
| Master / SFX / music volume, mute                                                                                    | part: Effects volume 0–10 (0 mutes); music pending                                                                                                                                               | Sound classes and mixes                                                                       | 3     |

## 9. Settings and accessibility

| Browser feature                                                                                                                | Unreal today                                                                                                                                                            | Better in Unreal                          | Phase |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----- |
| Reduce motion, colourblind glyphs, hand privacy, hold-to-reveal, rookie tips, show why, bot speed, UI scale, turn timer, theme | part: reduce motion, bot speed, start view, effects volume, hall on/off and day/night; reduced motion also settles dice/construction immediately (GameUserSettings.ini) | Same, saved in `USaveGame`                | 3     |
| Keyboard-operable targets, screen-reader announcements                                                                         | part: keys and gamepad on the board and panel, glyph prompts that follow the device; no screen reader                                                                   | Gamepad everywhere; rebindable keys (new) | 2 → 3 |
| Saves: local versioned save, settings, profile                                                                                 | part: autosave/Continue records implemented and tested; settings/profile persistence pending                                                                            | Save slots, Steam Cloud                   | 2 / 6 |

## Order of work

1. **Finish phase 2 validation**: the cooked package and automated full matches are checked; finish a full game by hand with a mouse and a real gamepad. Seats, hot-seat, autosave/Continue, targeted offers, leave/victory screens and board navigation are implemented; the full manual/hardware check remains.
2. **Phase 3, the look:** the 3D war table and board, the Hall & Chart UI in UMG, audio. This moved
   ahead of online play so the game looks and sounds like the finished game early.
3. **Phase 4, the island walk (local):** migrate the island prototype, live buildings, knight,
   horses, rooms, chest, dummy, minimap, customisation.
4. **Phase 5, online through Steam:** lobbies, host as referee, redaction, rejoin, autopilot, live
   PvP and duels.
5. **Phase 6, release.**

## Native presentation rework (2026-11-27)

Stationary match player cards replace the swinging flags. A shared authoritative 2D dice widget
shows both faces and the sum on the table and exploration HUD, and the log records the exact roll.
Physical table dice/tray and the instruction ribbon are removed. Window-based UI scaling and
bounded scrolling keep panels in view. Knight slope foot placement, natural stride/cadence,
marked collision-terrain summit paths, original animated sky/foliage, stronger water color,
connected roads/harbor landings and warmer table lighting are implemented. This does not close
the remaining phase 4 gameplay, audio, customization, controller or online parity items.
