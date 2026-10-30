import { create } from 'zustand';
import type { Pose } from '@hexfall/net';

/**
 * Where everyone is in the 3D walk (online games), as the server relays it about ten times a
 * second. Kept apart from the game store so only the walk and the board's markers re-render.
 */
export const usePresence = create<{ poses: (Pose | null)[] }>(() => ({ poses: [] }));
