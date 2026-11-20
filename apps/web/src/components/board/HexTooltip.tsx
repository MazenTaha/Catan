import { TERRAIN_RESOURCE, pips, type GameState } from '@hexfall/engine';
import { RESOURCE_NAME, TERRAIN_NAME } from '../../lexicon';
import { Arms } from '../../ui/hall/Arms';
import { ResourceArt } from '../../ui/hall/Controls';
import { hexCenter, playersAdjacentToHex, toPercent } from './geometry';

/** A map note pinned above the hovered hex by a dashed ink leader line. */
export function HexTooltip({ state, hex }: { state: GameState; hex: number }) {
  const h = state.board.hexes[hex];
  const res = TERRAIN_RESOURCE[h.terrain];
  const c = hexCenter(hex);
  const pos = toPercent({ x: c.x, y: c.y - 70 });
  const p = pips(h.token);
  const owners = playersAdjacentToHex(state.board, state.buildings, hex);
  const haunted = state.wraithHex === hex;
  return (
    <div className="pointer-events-none absolute z-20 w-max min-w-[180px] -translate-x-1/2 -translate-y-full" style={pos} role="tooltip">
      <div className="hc-note">
        <div className="hc-note__title text-[16px]">Produces</div>
        {res ? (
          <div className="mt-0.5 flex items-center gap-1.5 not-italic">
            <ResourceArt res={res} size={28} />
            <span>{RESOURCE_NAME[res]}</span>
          </div>
        ) : (
          <div className="hc-note__body">Nothing ({TERRAIN_NAME[h.terrain]})</div>
        )}
        {h.token !== null && (
          <div className="mt-1 flex items-center gap-2">
            <span className={`hc-num text-[20px] ${h.token === 6 || h.token === 8 ? 'hc-rubric' : ''}`}>{h.token}</span>
            <span className="hc-note__body">
              {p}/36 · {Math.round((p / 36) * 1000) / 10}% per roll
            </span>
          </div>
        )}
        {haunted && <div className="hc-note__title mt-1">Blocked by the robber — yields nothing</div>}
        <div className="hc-note__body mt-1 flex items-center gap-1">
          {owners.length ? (
            <>
              <span className="mr-1">Settled by</span>
              {owners.map((o) => (
                <Arms key={o} color={state.players[o].color} sigil={state.players[o].sigil} size={20} label={state.players[o].name} />
              ))}
            </>
          ) : (
            <span>Unsettled</span>
          )}
        </div>
      </div>
      {/* leader line down to the hex */}
      <span className="hc-leader left-1/2 top-full h-8" aria-hidden />
    </div>
  );
}
