/**
 * The Unreal app shows this page in its built-in browser and binds a small native object at
 * `window.ue.catanhost` (Unreal lower-cases the method names). In an ordinary browser it is absent.
 */
interface NativeHost {
  quit(): Promise<void> | void;
  /**
   * Mouse look for the 3D walk's Dive in. Unreal's browser has no pointer lock, so the app hides
   * and recentres the cursor itself and sends the movement as `catanhost:look` events
   * (`detail: { dx, dy }` in CSS pixels); it sends `catanhost:unlock` if it lets go on its own.
   */
  lockmouse(on: boolean): Promise<void> | void;
}

export interface HostLookDetail {
  dx: number;
  dy: number;
}

export function nativeHost(): NativeHost | undefined {
  return (window as unknown as { ue?: { catanhost?: NativeHost } }).ue?.catanhost;
}

const NAMED: Record<number, string> = {
  8: 'Backspace',
  9: 'Tab',
  13: 'Enter',
  27: 'Escape',
  32: 'Space',
  37: 'ArrowLeft',
  38: 'ArrowUp',
  39: 'ArrowRight',
  40: 'ArrowDown',
  46: 'Delete',
};
const SIDED: Record<number, string> = { 16: 'Shift', 17: 'Control', 18: 'Alt' };
// Unreal sends the left/right virtual-key codes (VK_LSHIFT…VK_RMENU) instead of the generic ones.
const LEFT_RIGHT: Record<number, string> = {
  160: 'ShiftLeft',
  161: 'ShiftRight',
  162: 'ControlLeft',
  163: 'ControlRight',
  164: 'AltLeft',
  165: 'AltRight',
};

/** The physical-key name a browser would report for this legacy key code, if there is one. */
function codeFor(e: KeyboardEvent): string {
  const k = e.keyCode;
  if (k >= 65 && k <= 90) return `Key${String.fromCharCode(k)}`;
  if (k >= 48 && k <= 57) return `Digit${k - 48}`;
  if (k >= 96 && k <= 105) return `Numpad${k - 96}`;
  if (SIDED[k]) return SIDED[k] + (e.location === 2 ? 'Right' : 'Left');
  return LEFT_RIGHT[k] ?? NAMED[k] ?? '';
}

/**
 * Unreal's browser delivers key events with an empty `KeyboardEvent.code`, which the 3D walk and
 * shortcuts read. Fill it in from the key code before anything else sees the event. Browsers that
 * report `code` themselves are untouched.
 */
export function fillMissingKeyCodes() {
  const fill = (e: KeyboardEvent) => {
    if (e.code) return;
    const code = codeFor(e);
    if (code) Object.defineProperty(e, 'code', { value: code });
  };
  window.addEventListener('keydown', fill, true);
  window.addEventListener('keyup', fill, true);
}
