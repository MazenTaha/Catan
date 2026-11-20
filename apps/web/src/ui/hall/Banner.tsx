import { memo, useId, type ReactNode } from 'react';
import type { PlayerColor, Sigil } from '@hexfall/engine';
import { Icon, type IconName } from '../../art/icons/Icon';
import { ArmsDefs, ArmsShape, clothOf } from './Arms';
import finialUrl from './svg/spear-finial.svg';

/** Heraldic tinctures for banner cloth. */
export const TINCTURE = {
  gules: '#8a1a16',
  azure: '#1f3a7a',
  vert: '#24543a',
  sable: '#1f1b18',
  purpure: '#4f2560',
  or: '#c99a2e',
  argent: '#e6dcc4',
} as const;
export type Tincture = keyof typeof TINCTURE;
export type Ordinary = 'pale' | 'chevron' | 'bend' | 'chief' | 'quarterly' | 'saltire' | 'paly';

/** A cloth colour: a tincture, a player's colour (deepened for cloth) or any hex. */
export type Cloth = Tincture | { player: PlayerColor } | string;
function clothHex(c: Cloth): string {
  if (typeof c === 'object') return clothOf(c.player);
  return c in TINCTURE ? TINCTURE[c as Tincture] : c;
}

/** The ring centre's height above the banner's top edge; poles align to it. */
export const RING_Y = 10;
/** How far the label ribbon and tassels reach past the cloth, each side. */
const SIDE = 26;
/** Room under the cloth for fringe and tassels. */
const TAIL = 40;

function clothPath(w: number, h: number) {
  const a = 22 + (h - 22) * 0.35;
  const b = 22 + (h - 22) * 0.685;
  const notch = h - 0.3 * w;
  return `M3 22H${w - 3}C${w} ${a} ${w - 5} ${b} ${w - 3} ${h}L${w / 2} ${notch}L3 ${h}C5 ${b} 0 ${a} 3 22Z`;
}

function ordinaryShape(o: Ordinary, w: number, h: number, fill: string) {
  switch (o) {
    case 'pale':
      return <rect x={w * 0.36} y={0} width={w * 0.28} height={h} fill={fill} />;
    case 'chief':
      return <rect x={0} y={0} width={w} height={22 + h * 0.13} fill={fill} />;
    case 'chevron': {
      const y0 = h * 0.6;
      const y1 = y0 + w * 0.55;
      const t = w * 0.2;
      return <polygon points={`0,${y1} ${w / 2},${y0} ${w},${y1} ${w},${y1 + t} ${w / 2},${y0 + t} 0,${y1 + t}`} fill={fill} />;
    }
    case 'bend': {
      const t = w * 0.24;
      return <polygon points={`0,${22} ${t},${22} ${w},${h * 0.62} ${w},${h * 0.62 + t * 1.6} 0,${22 + t * 1.6}`} fill={fill} transform={`translate(0 ${-t * 0.5})`} />;
    }
    case 'quarterly':
      return (
        <g fill={fill}>
          <rect x={0} y={0} width={w / 2} height={22 + (h - 22) * 0.42} />
          <rect x={w / 2} y={22 + (h - 22) * 0.42} width={w / 2} height={h} />
        </g>
      );
    case 'saltire': {
      const t = w * 0.12;
      return (
        <g stroke={fill} strokeWidth={t * 2}>
          <line x1={0} y1={22} x2={w} y2={h * 0.8} />
          <line x1={w} y1={22} x2={0} y2={h * 0.8} />
        </g>
      );
    }
    case 'paly':
      return (
        <g fill={fill}>
          {[1, 3, 5].map((i) => (
            <rect key={i} x={(w / 6) * i} y={0} width={w / 6} height={h} />
          ))}
        </g>
      );
  }
}

export interface BannerProps {
  /** Cloth width and the height of the cloth's sides (tassels hang below). */
  width: number;
  height: number;
  tincture: Cloth;
  ordinary?: Ordinary;
  ordinaryTincture?: Cloth;
  icon?: IconName;
  arms?: { color: PlayerColor; sigil: Sigil } | 'empty';
  label: ReactNode;
  labelSize?: number;
  gloss?: ReactNode;
  glossTone?: 'ok' | 'warn';
  /** Small line over the emblem ("Seat II"). */
  kicker?: ReactNode;
  /** A big blackletter numeral between the arms and the ribbon (victory points). */
  numeral?: ReactNode;
  /** Something extra on the cloth (a crown, an "away" tag), positioned by the caller. */
  extra?: ReactNode;
  lit?: boolean;
  away?: boolean;
  as?: 'button' | 'div';
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-pressed'?: boolean;
  'aria-selected'?: boolean;
  role?: string;
  'data-testid'?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/**
 * A heraldic banner: brass rings on the pole, a swallowtailed cloth with an ordinary, weave and
 * folds, an embroidered border, gold fringe and tassels, an emblem (medallion or arms) and a
 * parchment ribbon carrying the label as real text.
 */
export const Banner = memo(function Banner(p: BannerProps) {
  const uid = useId().replace(/:/g, '');
  const { width: w, height: h } = p;
  const field = clothHex(p.tincture);
  const path = clothPath(w, h);
  const notch = h - 0.3 * w;
  const inset = `M12 32H${w - 12}V${h - 14}L${w / 2} ${notch - 12}L12 ${h - 14}Z`;
  const cy = h * 0.31;
  const r = Math.min(w * 0.27, h * 0.15);
  const labelSize = p.labelSize ?? (w >= 170 ? 26 : 20);
  const ribbonH = Math.round(labelSize * 1.55);
  const armsH = Math.min(w * 0.62, h * 0.32);
  const armsW = (armsH * 100) / 120;
  const numeralSize = w >= 140 ? 34 : 28;
  const numeralTop = cy + armsH * 0.48;
  // The victory-point numeral sits between the arms and the ribbon, never in the notch.
  const ribbonY = Math.round(p.numeral !== undefined ? Math.max(h * 0.58, numeralTop + numeralSize + 4) : h * 0.58);
  const fringe: number[] = [];
  const n = Math.max(6, Math.round(w / 2 / 4.2));
  for (let i = 0; i <= n; i++) fringe.push(i / n);
  const As = p.as === 'button' ? 'button' : 'div';
  return (
    <As
      type={As === 'button' ? 'button' : undefined}
      className={`hc-banner ${p.className ?? ''}`}
      style={{ width: w, height: h + TAIL, ...p.style }}
      onClick={p.onClick}
      disabled={As === 'button' ? p.disabled : undefined}
      aria-disabled={As === 'div' && p.disabled ? true : undefined}
      aria-label={p['aria-label']}
      aria-describedby={p['aria-describedby']}
      aria-pressed={p['aria-pressed']}
      aria-selected={p['aria-selected']}
      role={p.role}
      data-lit={p.lit || p.selected ? 'true' : undefined}
      data-away={p.away ? 'true' : undefined}
      data-testid={p['data-testid']}
      onMouseEnter={p.onMouseEnter}
      onMouseLeave={p.onMouseLeave}
    >
      <svg
        className="hc-banner__cloth"
        width={w + SIDE * 2}
        height={h + TAIL}
        viewBox={`${-SIDE} 0 ${w + SIDE * 2} ${h + TAIL}`}
        style={{ position: 'absolute', left: -SIDE, top: 0, overflow: 'visible' }}
        aria-hidden
      >
        <defs>
          <clipPath id={`c${uid}`}>
            <path d={path} />
          </clipPath>
          <pattern id={`w${uid}`} width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M0 4L4 0" stroke="#000" strokeWidth=".6" opacity=".25" />
            <path d="M0 0L4 4" stroke="#fff" strokeWidth=".4" opacity=".08" />
          </pattern>
          <linearGradient id={`f${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#000" stopOpacity=".45" />
            <stop offset=".12" stopColor="#000" stopOpacity=".05" />
            <stop offset=".26" stopColor="#fff" stopOpacity=".10" />
            <stop offset=".38" stopColor="#000" stopOpacity=".28" />
            <stop offset=".52" stopColor="#fff" stopOpacity=".12" />
            <stop offset=".66" stopColor="#000" stopOpacity=".24" />
            <stop offset=".8" stopColor="#fff" stopOpacity=".08" />
            <stop offset="1" stopColor="#000" stopOpacity=".5" />
          </linearGradient>
          <linearGradient id={`s${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity=".35" />
            <stop offset=".12" stopColor="#000" stopOpacity="0" />
            <stop offset=".85" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity=".3" />
          </linearGradient>
          <linearGradient id={`b${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6dc93" />
            <stop offset=".5" stopColor="#c99a2e" />
            <stop offset="1" stopColor="#6b4a12" />
          </linearGradient>
          <linearGradient id={`r${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f7ecd0" />
            <stop offset=".55" stopColor="#ecdcb4" />
            <stop offset="1" stopColor="#d2bb8a" />
          </linearGradient>
          {p.arms && p.arms !== 'empty' && <ArmsDefs id={`a${uid}`} />}
        </defs>

        {/* shadow */}
        <path d={path} fill="#000" opacity=".45" transform="translate(5 8)" />
        {/* hanging: a cloth loop under each brass ring */}
        {[0.18, 0.5, 0.82].map((x) => (
          <g key={x}>
            <rect x={w * x - 7} y={16} width={14} height={12} rx={2} fill={field} stroke="#1a120b" strokeWidth="1.2" />
            <circle cx={w * x} cy={RING_Y} r={9} fill="none" stroke={`url(#b${uid})`} strokeWidth="3.5" />
          </g>
        ))}
        {/* cloth, ordinary, weave, folds, shade */}
        <path d={path} fill={field} />
        <g clipPath={`url(#c${uid})`}>
          {p.ordinary && ordinaryShape(p.ordinary, w, h, clothHex(p.ordinaryTincture ?? 'or'))}
          <rect width={w} height={h} fill={`url(#w${uid})`} />
          <rect width={w} height={h} fill={`url(#f${uid})`} />
          <rect width={w} height={h} fill={`url(#s${uid})`} />
        </g>
        {/* embroidered border and outline */}
        <path d={inset} fill="none" stroke="#d9a93f" strokeWidth="3" />
        <path d={inset} fill="none" stroke="#f3d27a" strokeWidth="1" strokeDasharray="3 3" opacity=".8" />
        <path d={path} fill="none" stroke="#1a120b" strokeWidth="2" strokeLinejoin="round" />
        {/* fringe along both bottom edges */}
        <g stroke="#d9a93f" strokeWidth="1.6">
          {fringe.map((t) => {
            const xl = 3 + (w / 2 - 3) * t;
            const yl = h + (notch - h) * t;
            const xr = w - 3 - (w / 2 - 3) * t;
            return (
              <g key={t}>
                <line x1={xl} y1={yl} x2={xl} y2={yl + 10} />
                <line x1={xr} y1={yl} x2={xr} y2={yl + 10} />
              </g>
            );
          })}
        </g>
        {/* a tassel at each tail */}
        {[3, w - 3].map((x) => (
          <g key={x}>
            <path d={`M${x} ${h}V${h + 12}`} stroke="#8a6018" strokeWidth="2" />
            <circle cx={x} cy={h + 15} r={5} fill={`url(#b${uid})`} stroke="#1a120b" strokeWidth="1" />
            <path d={`M${x - 5} ${h + 19}L${x - 8} ${h + 38}H${x + 8}L${x + 5} ${h + 19}Z`} fill="#d9a93f" stroke="#8a6018" strokeWidth="1" />
            <path d={`M${x - 2} ${h + 21}L${x - 3.5} ${h + 37}M${x + 2} ${h + 21}L${x + 3.5} ${h + 37}`} stroke="#8a6018" strokeWidth=".8" />
          </g>
        ))}
        {/* emblem */}
        {p.icon && (
          <g>
            <circle cx={w / 2} cy={cy} r={r} fill={`url(#b${uid})`} stroke="#1a120b" strokeWidth="1.5" />
            <circle cx={w / 2} cy={cy} r={r - 5} fill="#1f1b18" stroke="#1a120b" strokeWidth="1.5" />
            <circle cx={w / 2} cy={cy} r={r - 10} fill="none" stroke="#d9a93f" strokeWidth="1" strokeDasharray="2 2.5" />
            <g transform={`translate(${w / 2 - r * 0.55 + 1} ${cy - r * 0.55 + 1.5})`} color="#000" opacity=".7">
              <Icon name={p.icon} size={r * 1.1} strokeWidth={2.6} />
            </g>
            <g transform={`translate(${w / 2 - r * 0.55} ${cy - r * 0.55})`} color="#f3d27a">
              <Icon name={p.icon} size={r * 1.1} strokeWidth={1.6} />
            </g>
          </g>
        )}
        {p.arms && (
          <g transform={`translate(${w / 2 - armsW / 2} ${cy - armsH * 0.55}) scale(${armsW / 100} ${armsH / 120})`}>
            {p.arms === 'empty' ? <ArmsShape empty sheen="" /> : <ArmsShape color={p.arms.color} sigil={p.arms.sigil} sheen={`a${uid}`} />}
          </g>
        )}
        {/* label ribbon: folded tails behind, then the band */}
        <g>
          {[-1, 1].map((s) => {
            const x0 = s < 0 ? -22 : w + 22;
            const tip = x0 + s * 16;
            return (
              <path
                key={s}
                d={`M${x0 - s * 6} ${ribbonY + 6}H${tip}L${tip - s * 7} ${ribbonY + 6 + ribbonH / 2}L${tip} ${ribbonY + 6 + ribbonH}H${x0 - s * 6}Z`}
                fill="#b9a273"
                stroke="#1a120b"
                strokeWidth="1.3"
              />
            );
          })}
          <rect x={-22} y={ribbonY} width={w + 44} height={ribbonH} fill={`url(#r${uid})`} stroke="#1a120b" strokeWidth="1.5" />
          <path d={`M-22 ${ribbonY + 3}H${w + 22}`} stroke="#fff8e6" strokeWidth="1" opacity=".7" />
        </g>
      </svg>

      {p.kicker && (
        <span
          className="hc-label pointer-events-none absolute inset-x-0 text-center text-[13px] leading-none"
          style={{ top: 30, color: '#f6e7c4', textShadow: '0 1px 2px #000' }}
        >
          {p.kicker}
        </span>
      )}
      {p.numeral !== undefined && (
        <span
          className="hc-title pointer-events-none absolute inset-x-0 text-center leading-none"
          style={{
            top: numeralTop,
            fontSize: numeralSize,
            color: '#f3d27a',
            textShadow: '0 2px 0 #5a3a10, 0 3px 6px rgba(0,0,0,0.85)',
          }}
        >
          {p.numeral}
        </span>
      )}
      <span className="hc-ribbon" style={{ left: -22, right: -22, top: ribbonY, height: ribbonH }}>
        <span className="hc-ribbon__text" style={{ fontSize: labelSize }}>
          {p.label}
        </span>
      </span>
      {p.gloss && (
        <span className="hc-banner__gloss" style={{ top: ribbonY + ribbonH + 10, fontSize: w >= 170 ? 17 : 15 }} data-tone={p.glossTone}>
          {p.gloss}
        </span>
      )}
      {p.extra}
    </As>
  );
});

/**
 * The turned wooden pole the banners hang from: brass bands, spear-tip finials, iron wall
 * brackets with chains. Children are banners; their rings sit on the rod's centre line.
 */
export function BannerPole({
  children,
  gap = 20,
  overhang = 46,
  className = '',
  brackets = true,
  align = 'flex-start',
}: {
  children: ReactNode;
  gap?: number;
  overhang?: number;
  className?: string;
  brackets?: boolean;
  align?: 'flex-start' | 'center';
}) {
  return (
    <div className={`relative inline-flex ${className}`} style={{ gap, paddingLeft: overhang, paddingRight: overhang, alignItems: align }}>
      <div className="pointer-events-none absolute inset-x-0" style={{ top: RING_Y - 6, height: 12 }} aria-hidden>
        {brackets &&
          [0.22, 0.78].map((x) => (
            <span key={x} className="absolute" style={{ left: `${x * 100}%`, top: -46, width: 2, height: 46, background: 'repeating-linear-gradient(180deg, #4a4a50 0 5px, transparent 5px 7px)' }}>
              <span className="absolute" style={{ left: -7, bottom: -6, width: 16, height: 14, background: '#2a2a2e', border: '1px solid #000', borderRadius: 2, boxShadow: 'inset 0 1px 0 #6a6a70' }} />
            </span>
          ))}
        <span
          className="absolute"
          style={{
            left: 20,
            right: 20,
            top: 0,
            height: 12,
            borderRadius: 6,
            background: 'linear-gradient(180deg, #8a5e34 0%, #5a3a1e 45%, #2e1c0e 100%)',
            boxShadow: '0 3px 4px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,220,170,0.35)',
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent 0 134px, #c99a2e 134px 140px), linear-gradient(180deg, #8a5e34 0%, #5a3a1e 45%, #2e1c0e 100%)',
          }}
        />
        <img src={finialUrl} alt="" className="absolute" style={{ left: -4, top: -14, width: 50, height: 40, transform: 'scaleX(-1)' }} />
        <img src={finialUrl} alt="" className="absolute" style={{ right: -4, top: -14, width: 50, height: 40 }} />
      </div>
      {children}
    </div>
  );
}
