import type { CSSProperties, ReactNode } from 'react';
import torchUrl from './svg/torch.svg';
import windowUrl from './svg/night-window.svg';
import columnUrl from './svg/stone-column.svg';
import candleUrl from './svg/candle.svg';
import coinsUrl from './svg/coin-stack.svg';
import crestUrl from './svg/crest.svg';
import compassUrl from './svg/compass-rose.svg';
import sealUrl from './svg/wax-seal.svg';
import sealSmallUrl from './svg/wax-seal-small.svg';
import cornerUrl from './svg/iron-corner.svg';

/** Decorative image: hidden from assistive technology and never takes the pointer. */
function Deco({ src, style, className = '' }: { src: string; style?: CSSProperties; className?: string }) {
  return <img src={src} alt="" aria-hidden draggable={false} className={`pointer-events-none select-none ${className}`} style={style} />;
}

export const Crest = ({ size = 64, style }: { size?: number; style?: CSSProperties }) => (
  <Deco src={crestUrl} style={{ width: (size * 160) / 170, height: size, ...style }} />
);
export const CompassRose = ({ size = 110, style }: { size?: number; style?: CSSProperties }) => (
  <Deco src={compassUrl} style={{ width: size, height: (size * 230) / 220, ...style }} />
);
export const Candle = ({ height = 90, style }: { height?: number; style?: CSSProperties }) => (
  <Deco src={candleUrl} style={{ width: (height * 40) / 130, height, ...style }} />
);
export const CoinStack = ({ width = 64, style }: { width?: number; style?: CSSProperties }) => (
  <Deco src={coinsUrl} style={{ width, height: (width * 70) / 80, ...style }} />
);
export const WaxSeal = ({ size = 56, small = false, style }: { size?: number; small?: boolean; style?: CSSProperties }) => (
  <Deco src={small ? sealSmallUrl : sealUrl} style={{ width: size, height: size, ...style }} />
);
export const sealImage = sealUrl;

/** A wall torch with its warm glow (the glow flickers unless motion is reduced or effects are lite). */
export function Torch({ x, y, height = 150, flip = false }: { x: number | string; y: number | string; height?: number; flip?: boolean }) {
  const w = (height * 90) / 220;
  return (
    <div className="pointer-events-none absolute" style={{ left: x, top: y, width: w, height }} aria-hidden>
      <span className="hc-glow hc-flicker" style={{ left: w / 2, top: height * 0.17, width: 420, height: 420 }} />
      <Deco src={torchUrl} style={{ width: w, height, position: 'relative', transform: flip ? 'scaleX(-1)' : undefined }} />
    </div>
  );
}

export function NightWindow({ x, y, size = 190 }: { x: number | string; y: number | string; size?: number }) {
  return (
    <div className="pointer-events-none absolute" style={{ left: x, top: y, width: size, height: size }} aria-hidden>
      <Deco src={windowUrl} style={{ width: size, height: size }} />
    </div>
  );
}

export function StoneColumn({ side, width = 96 }: { side: 'left' | 'right'; width?: number }) {
  return (
    <div className="pointer-events-none absolute inset-y-0" style={{ [side]: 0, width }} aria-hidden>
      <Deco src={columnUrl} style={{ width, height: '100%', objectFit: 'fill' }} />
    </div>
  );
}

/**
 * The stone hall behind a full screen: tiled wall, heavy vignette, and optional columns, night
 * windows and torches. Every ornament is decoration only.
 */
export function HallBackground({ children, decor, className = '', style }: { children?: ReactNode; decor?: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`hc-hall hc-scope min-h-screen ${className}`} style={style}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {decor}
      </div>
      <div className="hc-vignette" aria-hidden />
      <div className="relative z-[2]">{children}</div>
    </div>
  );
}

/** Oak war table: oak texture, a darker top edge and a shadow cast onto the wall. */
export function WarTable({ className = '', style, children }: { className?: string; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div
      className={`hc-oak ${className}`}
      style={{ padding: 0, borderRadius: 0, borderWidth: '8px 0 0', borderColor: '#1c0f06', boxShadow: '0 -14px 30px rgba(0,0,0,0.55), inset 0 2px 0 rgba(255,210,150,0.12)', ...style }}
    >
      {children}
    </div>
  );
}

export function ParchmentSheet({ children, className = '', style, letter = false }: { children: ReactNode; className?: string; style?: CSSProperties; letter?: boolean }) {
  return (
    <div className={`${letter ? 'hc-letter' : 'hc-parchment'} ${className}`} style={style}>
      {children}
    </div>
  );
}

/** A vellum chart sheet with rolled wooden ends, neat line and tick marks. */
export function ChartSheet({ children, className = '', style, pad = 32 }: { children: ReactNode; className?: string; style?: CSSProperties; pad?: number }) {
  return (
    <div className={`hc-chart ${className}`} style={style}>
      <span className="hc-roll hc-roll--top" aria-hidden />
      <span className="hc-roll hc-roll--bottom" aria-hidden />
      <div className="relative" style={{ padding: pad }}>
        {children}
      </div>
    </div>
  );
}

const CORNERS: { pos: CSSProperties; rot: number }[] = [
  { pos: { left: -3, top: -3 }, rot: 0 },
  { pos: { right: -3, top: -3 }, rot: 90 },
  { pos: { right: -3, bottom: -3 }, rot: 180 },
  { pos: { left: -3, bottom: -3 }, rot: 270 },
];

/** Iron L-brackets with rivets on all four corners of a panel. */
export function IronCorners() {
  return (
    <>
      {CORNERS.map((c) => (
        <img key={c.rot} src={cornerUrl} alt="" aria-hidden className="hc-corner" style={{ ...c.pos, transform: `rotate(${c.rot}deg)` }} />
      ))}
    </>
  );
}

/**
 * Oak-and-iron panel: oak frame, iron brackets, a parchment inset, and an optional brass title
 * plate on the top edge.
 */
export function OakPanel({
  title,
  children,
  className = '',
  insetClassName = '',
  style,
  as: As = 'section',
  'aria-label': ariaLabel,
  plain = false,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  insetClassName?: string;
  style?: CSSProperties;
  as?: 'section' | 'div' | 'aside' | 'header';
  'aria-label'?: string;
  /** No parchment inset: content sits on the oak. */
  plain?: boolean;
}) {
  return (
    <As className={`hc-oak ${title ? 'mt-3' : ''} ${className}`} style={style} aria-label={ariaLabel}>
      <IronCorners />
      {title && <h2 className="hc-plate">{title}</h2>}
      {plain ? children : <div className={`hc-oak__inset ${title ? 'pt-4' : ''} ${insetClassName}`}>{children}</div>}
    </As>
  );
}

/** The title ribbon ("Trade · Build · Settle"), with real text over the kit's ribbon art. */
export function TitleRibbon({ children, width = 380, height = 46, size = 20 }: { children: ReactNode; width?: number; height?: number; size?: number }) {
  const band = height * 0.72;
  return (
    <div className="relative grid place-items-center" style={{ width, height }}>
      <svg className="pointer-events-none absolute inset-0 overflow-visible" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
        {[-1, 1].map((s) => {
          const x0 = s < 0 ? 40 : width - 40;
          const tip = s < 0 ? 0 : width;
          const y = height - band;
          return (
            <path
              key={s}
              d={`M${x0} ${y}H${tip}L${tip - s * 14} ${y + band / 2}L${tip} ${y + band}H${x0}Z`}
              fill="#b48a3a"
              stroke="#1a120b"
              strokeWidth="1.4"
            />
          );
        })}
        <rect x={28} y={1} width={width - 56} height={band} fill="#efe0bb" stroke="#1a120b" strokeWidth="1.6" />
        <path d={`M28 ${band + 1}L40 ${height - 1}V${band + 1}M${width - 28} ${band + 1}L${width - 40} ${height - 1}V${band + 1}`} fill="#6b4a12" stroke="#1a120b" strokeWidth="1.2" />
      </svg>
      <span className="hc-label relative tracking-[0.12em] text-[color:var(--ink)]" style={{ fontSize: size, marginTop: -(height - band) }}>
        {children}
      </span>
    </div>
  );
}

/** Loading: a slowly turning hourglass by a flickering flame, with the existing text. */
export function HallLoader({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full place-items-center" role="status">
      <div className="flex flex-col items-center gap-3">
        <svg width="44" height="56" viewBox="0 0 24 30" className="hc-turn" aria-hidden style={{ color: 'var(--gold-light)' }}>
          <path d="M5 2h14M5 28h14M7 2c0 7 10 8 10 13S7 21 7 28M17 2c0 7-10 8-10 13s10 6 10 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span className="hc-label text-[22px] text-[color:var(--gold-light)]">{children}</span>
      </div>
    </div>
  );
}
