import { useMemo } from 'react';
import { applyAction, createGame, decideAction, type GameState } from '@hexfall/engine';
import { BoardView } from '../board/Board';

/** Dev-only art inspection view: `#artboard` or `#artboard:<seed>:<actions>`. */
export default function ArtBoard() {
  const [, seed = 'art-seed', steps = '80'] = location.hash.split(':');
  const state = useMemo(() => {
    let s: GameState = createGame({
      seed,
      layout: 'balanced',
      targetVp: 10,
      firstPlayer: 0,
      seats: [
        { name: 'A', color: 'crimson', sigil: 'skull', kind: 'bot', bot: 'warlord' },
        { name: 'B', color: 'frost', sigil: 'moon', kind: 'bot', bot: 'warlord' },
        { name: 'C', color: 'bone', sigil: 'eye', kind: 'bot', bot: 'warlord' },
        { name: 'D', color: 'violet', sigil: 'thorn', kind: 'bot', bot: 'warlord' },
      ],
    });
    for (let i = 0; i < Number(steps) && s.phase.kind !== 'ended'; i++) {
      const r = applyAction(s, decideAction(s));
      if (!r.ok) break;
      s = r.value.state;
    }
    return s;
  }, [seed, steps]);
  return (
    <div className="min-h-screen bg-abyss p-2">
      <BoardView state={state} canAct={false} decorative />
    </div>
  );
}
