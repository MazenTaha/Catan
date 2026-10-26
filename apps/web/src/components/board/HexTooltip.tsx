import { TERRAIN_RESOURCE, pips, type GameState } from '@hexfall/engine';
import { RES_COLOR, ResourceGlyph } from '../../art/icons/Icon';
import { PlayerDisc } from '../../art/pieces/Sigil';
import { RESOURCE_NAME, TERRAIN_NAME } from '../../lexicon';
import { hexCenter, playersAdjacentToHex, toPercent } from './geometry';

export function HexTooltip({ state, hex }: { state: GameState; hex: number }) {
  const h = state.board.hexes[hex];
  const res = TERRAIN_RESOURCE[h.terrain];
  const c = hexCenter(hex);
  const pos = toPercent({ x: c.x, y: c.y - 70 });
  const p = pips(h.token);
  const owners = playersAdjacentToHex(state.board, state.buildings, hex);
  const haunted = state.wraithHex === hex;
  return (
    <div
      className="pointer-events-none absolute z-20 w-max min-w-[170px] -translate-x-1/2 -translate-y-full"
      style={pos}
      role="tooltip"
    >
      <div className="panel px-3 py-2 text-[14px]" style={{ ['--chamfer' as string]: '6px' }}>
        <div className="font-display text-[14px] uppercase tracking-[0.14em] text-gold">Produces</div>
        {res ? (
          <div className="mt-0.5 flex items-center gap-1.5">
            <span style={{ color: RES_COLOR[res] }}>
              <ResourceGlyph res={res} size={16} />
            </span>
            <span>{RESOURCE_NAME[res]}</span>
          </div>
        ) : (
          <div className="text-muted">Nothing ({TERRAIN_NAME[h.terrain]})</div>
        )}
        {h.token !== null && (
          <div className="mt-1 flex items-center gap-2">
            <span className={`num text-[18px] ${h.token === 6 || h.token === 8 ? 'text-[#e0585f]' : 'text-bone'}`}>{h.token}</span>
            <span className="text-muted">
              {p}/36 · {Math.round((p / 36) * 1000) / 10}% per roll
            </span>
          </div>
        )}
        {haunted && <div className="mt-1 text-frost">Blocked by the robber — yields nothing</div>}
        <div className="mt-1 flex items-center gap-1 text-muted">
          {owners.length ? (
            <>
              <span className="mr-1">Settled by</span>
              {owners.map((o) => (
                <PlayerDisc key={o} color={state.players[o].color} sigil={state.players[o].sigil} size={18} label={state.players[o].name} />
              ))}
            </>
          ) : (
            <span>Unsettled</span>
          )}
        </div>
      </div>
    </div>
  );
}
