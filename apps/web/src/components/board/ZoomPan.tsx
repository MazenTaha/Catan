import { useRef, useState, type ReactNode } from 'react';

/**
 * Pinch-zoom / drag-pan wrapper for small screens. Single-finger drags only pan once
 * zoomed in, so taps on the board still place pieces.
 */
export function ZoomPan({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ dist: number; scale: number; mid: { x: number; y: number }; x: number; y: number } | null>(null);
  const moved = useRef(false);

  if (!enabled) return <>{children}</>;

  const clamp = (v: { scale: number; x: number; y: number }) => {
    const scale = Math.min(3, Math.max(1, v.scale));
    const lim = (scale - 1) * 220;
    return { scale, x: Math.max(-lim, Math.min(lim, v.x)), y: Math.max(-lim, Math.min(lim, v.y)) };
  };

  return (
    <div
      className="relative touch-none overflow-hidden"
      onPointerDown={(e) => {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved.current = false;
        const pts = [...pointers.current.values()];
        if (pts.length === 2) {
          const [a, b] = pts;
          start.current = {
            dist: Math.hypot(a.x - b.x, a.y - b.y),
            scale: view.scale,
            mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            x: view.x,
            y: view.y,
          };
        } else {
          start.current = { dist: 0, scale: view.scale, mid: { x: e.clientX, y: e.clientY }, x: view.x, y: view.y };
        }
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId) || !start.current) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const pts = [...pointers.current.values()];
        if (pts.length === 2 && start.current.dist > 0) {
          const [a, b] = pts;
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          moved.current = true;
          setView(clamp({ ...view, scale: start.current.scale * (dist / start.current.dist) }));
        } else if (pts.length === 1 && view.scale > 1) {
          const dx = e.clientX - start.current.mid.x;
          const dy = e.clientY - start.current.mid.y;
          if (Math.hypot(dx, dy) > 6) moved.current = true;
          setView(clamp({ scale: view.scale, x: start.current.x + dx, y: start.current.y + dy }));
        }
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size === 0) start.current = null;
      }}
      onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
      onClickCapture={(e) => {
        if (moved.current) {
          e.stopPropagation();
          moved.current = false;
        }
      }}
      onDoubleClick={() => setView({ scale: 1, x: 0, y: 0 })}
    >
      <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: 'center' }}>{children}</div>
      {view.scale > 1 && (
        <button className="chip absolute right-2 top-2 bg-surface-1 text-muted" onClick={() => setView({ scale: 1, x: 0, y: 0 })}>
          Reset view
        </button>
      )}
    </div>
  );
}
