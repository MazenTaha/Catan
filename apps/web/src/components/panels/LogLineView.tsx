import { memo } from 'react';
import type { PlayerState } from '@hexfall/engine';
import { RESOURCE_NAME } from '../../lexicon';
import type { LogLine } from '../../state/log';
import { Arms } from '../../ui/hall/Arms';
import { ResourceArt } from '../../ui/hall/Controls';
import { CountsInline } from '../ui/primitives';

/** One herald's entry: a red ¶, then the text with each player's arms and the resources' art. */
export const LogLineView = memo(function LogLineView({
  line,
  players,
  compact = false,
}: {
  line: LogLine;
  players: PlayerState[];
  compact?: boolean;
}) {
  return (
    <div className={`hc-para ${compact ? 'text-[16px]' : 'text-[17px]'} leading-snug ${line.tone === 'muted' ? 'hc-ink-muted' : ''}`}>
      {line.parts.map((p, i) => {
        if (typeof p === 'string') return <span key={i}>{p}</span>;
        if ('player' in p) {
          const pl = players[p.player];
          return (
            <b key={i} className="inline-flex items-baseline gap-1 whitespace-nowrap" style={{ color: INK_NAME[pl.color] }}>
              <Arms color={pl.color} sigil={pl.sigil} size={compact ? 16 : 18} className="self-center" />
              {pl.name}
            </b>
          );
        }
        if ('res' in p) {
          return (
            <span key={i} className="inline-flex items-center gap-0.5 align-middle">
              {p.n !== undefined && <span className="hc-num">{p.n}</span>}
              <ResourceArt res={p.res} size={compact ? 20 : 22} />
              <span className="sr-only">{RESOURCE_NAME[p.res]}</span>
            </span>
          );
        }
        return <CountsInline key={i} counts={p.counts} size={compact ? 20 : 22} />;
      })}
    </div>
  );
});

/** Readable player name colors on dark backgrounds (AA). */
export const NAME_COLOR = {
  crimson: '#e2615c',
  frost: '#7aa8ea',
  bone: '#e8e2d0',
  violet: '#f0a060',
} as const;

/** Player name colors in ink on parchment (AA); White is written in plain ink. */
export const INK_NAME = {
  crimson: '#8a1a16',
  frost: '#1f3a7a',
  bone: '#3a2614',
  violet: '#8a3d06',
} as const;
