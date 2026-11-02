# Credits

All game art (terrain, pieces, tokens, cards, icons, and the 3D walk's models) is original and generated in code as SVG/CSS/canvas/three.js primitives.
All sound is synthesized at runtime with the WebAudio API unless real files are dropped into `apps/web/public/audio` and listed in `apps/web/src/audio/manifest.json`.

## Concept art

The 3D walk's models follow the owner's concept-art pack (`catan-night-concepts-2026-11-02`,
provided by the owner for this project; see `docs/CONCEPT_ART_MAPPING.md`). The card
illustrations in `apps/web/public/art/cards/` are cropped from its sheet 22. The models
themselves are built by the Blender scripts in `assets/blender/`.

## Music
The menu and board music is synthesized at runtime from public-domain compositions by Mozart and Beethoven. The notes were transcribed from Mutopia Project (mutopiaproject.org) editions: Mozart, Piano Sonata K.545 I (Alejandro Sierra, CC BY-SA 3.0), Rondo alla Turca K.331 III (public domain), Eine kleine Nachtmusik K.525 I (public domain); Beethoven, Moonlight Sonata Op. 27 No. 2 I (CC BY-SA 2.5), Pathétique Op. 13 II (public domain). Ode to Joy is the well-known theme.

## Fonts (SIL Open Font License 1.1)
- **Cinzel** — Natanael Gama. Via `@fontsource/cinzel`.
- **Cinzel Decorative** — Natanael Gama. Via `@fontsource/cinzel-decorative`.
- **Crimson Pro** — Jacques Le Bailly. Via `@fontsource/crimson-pro`.

## Libraries
React, React DOM, Zustand, Framer Motion, Howler.js, three.js, Tailwind CSS, Vite, Vitest, Playwright, ESLint, Prettier — all MIT/Apache-2.0 licensed.
