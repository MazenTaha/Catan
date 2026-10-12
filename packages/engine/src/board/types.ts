import type { Resource, Terrain } from '../lexicon-keys';
import type { EdgeId, VertexId } from './coords';

export type LayoutMode = 'balanced' | 'random' | 'beginner';

export interface HexTile {
  id: number;
  q: number;
  r: number;
  terrain: Terrain;
  /** Number token, or null for the Dead Waste. */
  token: number | null;
}

export type HarborKind = Resource | 'any';

export interface Harbor {
  id: number;
  kind: HarborKind;
  edge: EdgeId;
  vertices: [VertexId, VertexId];
  /** The land hex the harbor's edge belongs to. */
  hex: number;
}

export interface Board {
  layoutId: 'standard';
  seed: string;
  mode: LayoutMode;
  hexes: HexTile[];
  harbors: Harbor[];
}
