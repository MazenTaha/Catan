/**
 * Phones and tablets: a touch-first device, judged by the device rather than the window size,
 * so a narrow desktop window still counts as a desktop. iPadOS reports itself as a Mac, so a
 * "Mac" with multi-touch is treated as a tablet. Read once; it doesn't change during a session.
 */
export const isTouchDevice: boolean = (() => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent);
  const iPadOs = /Macintosh|MacIntel/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  return coarse || mobileUa || iPadOs;
})();
