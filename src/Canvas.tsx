import { useCallback, useEffect, useRef, useState } from 'react';
import { stats } from './lib/logic';
import { GROUPS, hrs, type Atlas, type Interest, type Link } from './lib/types';

export const CARD_W = 230, CARD_H = 132;
const center = (i: Interest) => ({ x: i.x + CARD_W / 2, y: i.y + CARD_H / 2 });

/** A curve that bows away from the middle of the map, so long links arc around cards instead of over them. */
function curve(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if ((mx - c.x) * nx + (my - c.y) * ny < 0) { nx = -nx; ny = -ny; }
  const off = Math.min(170, 30 + len * 0.22);
  const cx = mx + nx * off, cy = my + ny * off;
  return { d: `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`, dot: { x: 0.25 * a.x + 0.5 * cx + 0.25 * b.x, y: 0.25 * a.y + 0.5 * cy + 0.25 * b.y } };
}

export default function Canvas({ atlas, selected, onSelect, onMove }: {
  atlas: Atlas; selected: { kind: 'interest' | 'link'; id: string } | null;
  onSelect: (s: { kind: 'interest' | 'link'; id: string } | null) => void; onMove: (id: string, x: number, y: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 20, y: 20, z: 0.9 });
  const drag = useRef<{ kind: 'pan' | 'card'; id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const fit = useCallback(() => {
    const el = wrap.current; if (!el || !atlas.interests.length) return;
    const xs = atlas.interests.map((i) => i.x), ys = atlas.interests.map((i) => i.y);
    const minX = Math.min(...xs) - 60, minY = Math.min(...ys) - 60, maxX = Math.max(...xs) + CARD_W + 60, maxY = Math.max(...ys) + CARD_H + 60;
    const z = Math.min(1.1, el.clientWidth / (maxX - minX), el.clientHeight / (maxY - minY));
    setView({ z, x: (el.clientWidth - (maxX - minX) * z) / 2 - minX * z, y: (el.clientHeight - (maxY - minY) * z) / 2 - minY * z });
  }, [atlas.interests]);
  useEffect(() => { fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); /* fit once per layout */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    setView((v) => { const z = Math.min(2, Math.max(0.35, v.z * (e.deltaY < 0 ? 1.1 : 0.9))); return { z, x: px - ((px - v.x) * z) / v.z, y: py - ((py - v.y) * z) / v.z }; });
  };
  const down = (e: React.PointerEvent, id?: string) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const i = id ? atlas.interests.find((x) => x.id === id) : null;
    drag.current = { kind: id ? 'card' : 'pan', id, sx: e.clientX, sy: e.clientY, ox: i ? i.x : view.x, oy: i ? i.y : view.y, moved: false };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.kind === 'pan') setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    else if (d.id && d.moved) onMove(d.id, Math.round(d.ox + dx / view.z), Math.round(d.oy + dy / view.z));
  };
  const up = () => {
    const d = drag.current; drag.current = null;
    if (d && !d.moved) onSelect(d.kind === 'card' && d.id ? { kind: 'interest', id: d.id } : null);
  };

  const byId = new Map(atlas.interests.map((i) => [i.id, i]));
  const mid = atlas.interests.length ? { x: atlas.interests.reduce((s, i) => s + center(i).x, 0) / atlas.interests.length, y: atlas.interests.reduce((s, i) => s + center(i).y, 0) / atlas.interests.length } : { x: 0, y: 0 };
  const geo = (l: Link) => curve(center(byId.get(l.a)!), center(byId.get(l.b)!), mid);
  const visible = atlas.links.filter((l) => l.status !== 'dismissed' && byId.has(l.a) && byId.has(l.b));
  const clusters = GROUPS.map((g) => {
    const items = atlas.interests.filter((i) => i.group === g);
    if (!items.length) return null;
    const x0 = Math.min(...items.map((i) => i.x)) - 24, y0 = Math.min(...items.map((i) => i.y)) - 44, x1 = Math.max(...items.map((i) => i.x + CARD_W)) + 24, y1 = Math.max(...items.map((i) => i.y + CARD_H)) + 24;
    return { g, x0, y0, w: x1 - x0, h: y1 - y0 };
  }).filter(Boolean) as { g: string; x0: number; y0: number; w: number; h: number }[];

  return (
    <div className="canvas" ref={wrap} onPointerDown={(e) => down(e)} onPointerMove={move} onPointerUp={up} onWheel={onWheel} role="application" aria-label="Interest map: drag cards to arrange, drag the background to pan">
      <div className="plane" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
        {clusters.map((c) => <div key={c.g} className={`cluster g-${c.g}`} style={{ left: c.x0, top: c.y0, width: c.w, height: c.h }}><span>{c.g}</span></div>)}
        <svg className="links" width="1" height="1" overflow="visible" aria-hidden="true">
          {visible.map((l) => <path key={l.id} d={geo(l).d} className={`link ${l.status}${selected?.id === l.id ? ' sel' : ''}`} />)}
        </svg>
        {visible.map((l) => { const p = geo(l).dot;
          return <button key={l.id} className={`link-dot ${l.status}${selected?.id === l.id ? ' sel' : ''}`} style={{ left: p.x, top: p.y }}
            onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onSelect({ kind: 'link', id: l.id }); }}
            aria-label={`Link between ${byId.get(l.a)!.name} and ${byId.get(l.b)!.name}: ${l.technique ?? ''}`}>{l.status === 'accepted' ? '✓' : '?'}</button>; })}
        {atlas.interests.map((i) => { const s = stats(atlas, i.id); const quiet = s.daysSince == null || s.daysSince >= 14;
          return (
            <div key={i.id} className={`card g-${i.group}${selected?.id === i.id ? ' sel' : ''}${quiet ? ' quiet' : ''}`} style={{ left: i.x, top: i.y, width: CARD_W, height: CARD_H }}
              onPointerDown={(e) => down(e, i.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onSelect({ kind: 'interest', id: i.id }); }} aria-label={`${i.name}: ${i.goal}`}>
              <p className="c-name">{i.name}</p>
              <p className="c-goal">{i.goal}</p>
              <p className="c-stats"><b>{hrs(s.minutes)}</b> this month · {s.streak ? `${s.streak}-day streak` : quiet ? `quiet for ${s.daysSince ?? '–'} days` : `${s.sessions} sessions`}</p>
            </div>
          ); })}
      </div>
      <div className="zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button onClick={() => setView((v) => ({ ...v, z: Math.min(2, v.z * 1.2) }))} aria-label="Zoom in">+</button>
        <button onClick={() => setView((v) => ({ ...v, z: Math.max(0.35, v.z / 1.2) }))} aria-label="Zoom out">−</button>
        <button onClick={fit} aria-label="Fit everything">⤢</button>
      </div>
    </div>
  );
}

export const linkLabel = (l: Link, a: Atlas) => `${a.interests.find((i) => i.id === l.a)?.name} ↔ ${a.interests.find((i) => i.id === l.b)?.name}`;
