import { memo } from 'react';
import type { PlayerState } from '@hexfall/engine';
import { Icon, RES_COLOR, ResourceGlyph } from '../../art/icons/Icon';
import { RESOURCE_NAME } from '../../lexicon';
import type { LogLine } from '../../state/log';
import { CountsInline } from '../ui/primitives';

export const LogLineView = memo(function LogLineView({
  line,
  players,
  compact = false,
}: {
  line: LogLine;
  players: PlayerState[];
  compact?: boolean;
}) {
  const toneClass =
    line.tone === 'good' ? 'text-venom' : line.tone === 'bad' ? 'text-ember' : line.tone === 'gold' ? 'text-gold' : 'text-muted';
  return (
    <div className={`flex items-start gap-2 ${compact ? 'text-[14px]' : 'text-[15px]'} leading-snug`}>
      <Icon name={line.icon} size={compact ? 14 : 16} className={`mt-[3px] shrink-0 ${toneClass}`} />
      <span className={line.tone === 'muted' ? 'text-muted' : 'text-bone/90'}>
        {line.parts.map((p, i) => {
          if (typeof p === 'string') return <span key={i}>{p}</span>;
          if ('player' in p) {
            const pl = players[p.player];
            return (
              <b
                key={i}
                className="font-semibold"
                style={{ color: NAME_COLOR[pl.color] }}
              >
                {pl.name}
              </b>
            );
          }
          if ('res' in p) {
            return (
              <span key={i} className="inline-flex items-center gap-0.5 align-middle">
                {p.n !== undefined && <span className="num">{p.n}</span>}
                <span style={{ color: RES_COLOR[p.res] }}>
                  <ResourceGlyph res={p.res} size={14} />
                </span>
                <span className="sr-only">{RESOURCE_NAME[p.res]}</span>
              </span>
            );
          }
          return <CountsInline key={i} counts={p.counts} size={14} />;
        })}
      </span>
    </div>
  );
});

/** Readable player name colors on dark backgrounds (AA). */
export const NAME_COLOR = {
  crimson: '#e2615c',
  frost: '#7aa8ea',
  bone: '#e8e2d0',
  violet: '#b48af0',
} as const;
