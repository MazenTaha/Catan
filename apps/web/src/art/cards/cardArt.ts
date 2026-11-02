/**
 * Card illustrations, one image per resource and development card (cropped from the owner's
 * concept sheet 22; no text in them: names and rules stay in code). Served from
 * `public/art/cards/<key>.webp`.
 */
export const cardArt = (key: string): string => `${import.meta.env.BASE_URL}art/cards/${key}.webp`;
