import { useEffect, useMemo, useState } from 'react';
import Canvas, { linkLabel } from './Canvas';
import { addLog, parseLog, planWeek, stats } from './lib/logic';
import { sampleAtlas } from './lib/sample';
import { GROUPS, hrs, uid, type Atlas, type Group, type Interest, type Link } from './lib/types';

const KEY = 'atlas.v1';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
type View = 'map' | 'week' | 'review';
function load(): Atlas { try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch { /* ignore */ } return sampleAtlas(); }

export default function App() {
  const [atlas, setAtlas] = useState<Atlas>(load);
  const [view, setView] = useState<View>(() => (['#week', '#review'].includes(window.location.hash) ? (window.location.hash.slice(1) as View) : 'map'));
  const [sel, setSel] = useState<{ kind: 'interest' | 'link'; id: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(atlas)); } catch { /* ignore */ } }, [atlas]);
  useEffect(() => { history.replaceState(null, '', view === 'map' ? '#' : `#${view}`); }, [view]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);
  const edit = (f: (a: Atlas) => Atlas) => setAtlas((a) => ({ ...f(a), demo: a.demo }));

  return (
    <div className="page">
      <header className="top">
        <p className="mark"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="7" r="3" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="3.5" /><path d="M8.5 8.5 10.5 15M15.8 7.6 13.4 14.7M8.8 6.8 15.5 6.2" /></svg>Atlas</p>
        <nav className="views" aria-label="Views">
          {([['map', 'Map'], ['week', 'This week'], ['review', 'Monthly review']] as [View, string][]).map(([v, l]) => <button key={v} className={view === v ? 'on' : ''} aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)}>{l}</button>)}
        </nav>
      </header>
      {atlas.demo && <p className="banner">A sample polymath with six interests and three months of practice. Change anything, or <button className="link" onClick={() => { setAtlas({ interests: [], logs: [], resources: [], links: [], freeMinutes: [45, 45, 45, 45, 45, 120, 120], demo: false }); setSel(null); }}>start your own map</button>.</p>}
      <LogBar atlas={atlas} onLog={(id, min, note) => { edit((a) => addLog(a, id, min, note)); setToast(`Logged ${hrs(min)} of ${atlas.interests.find((i) => i.id === id)?.name}.`); }} />
      {view === 'map' && <MapView atlas={atlas} edit={edit} sel={sel} setSel={setSel} say={setToast} />}
      {view === 'week' && <Week atlas={atlas} edit={edit} />}
      {view === 'review' && <Review atlas={atlas} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      <footer className="foot">Your map stays in this browser. Built by <a href="https://shreygupta-three.vercel.app" target="_blank" rel="noopener">Shrey Gupta</a> · <a href="https://github.com/shreycodeslit/atlas" target="_blank" rel="noopener">Code on GitHub</a></footer>
    </div>
  );
}

function LogBar({ atlas, onLog }: { atlas: Atlas; onLog: (id: string, min: number, note: string) => void }) {
  const [t, setT] = useState('');
  const [pick, setPick] = useState<{ minutes: number; note: string } | null>(null);
  const parsed = useMemo(() => (t.trim() ? parseLog(t, atlas.interests) : null), [t, atlas.interests]);
  const submit = () => {
    if (!parsed) return;
    const minutes = parsed.minutes ?? 30;
    if (parsed.interestId) { onLog(parsed.interestId, minutes, parsed.note); setT(''); }
    else setPick({ minutes, note: parsed.note || t.trim() });
  };
  if (!atlas.interests.length) return null;
  return (
    <form className="logbar" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label htmlFor="log" className="sr">Log a session</label>
      <input id="log" value={t} onChange={(e) => { setT(e.target.value); setPick(null); }} placeholder="Log a session: “guitar 40 min barre chords”" autoComplete="off" />
      {parsed && !pick && <span className="parsed">{parsed.interestId ? atlas.interests.find((i) => i.id === parsed.interestId)!.name : 'Which interest?'} · {parsed.minutes ? hrs(parsed.minutes) : '30 min'}</span>}
      <button disabled={!t.trim()}>Log it</button>
      {pick && <div className="pick">Which interest was that? {atlas.interests.map((i) => <button type="button" key={i.id} onClick={() => { onLog(i.id, pick.minutes, pick.note); setT(''); setPick(null); }}>{i.name}</button>)}</div>}
    </form>
  );
}

function MapView({ atlas, edit, sel, setSel, say }: { atlas: Atlas; edit: (f: (a: Atlas) => Atlas) => void; sel: { kind: 'interest' | 'link'; id: string } | null; setSel: (s: { kind: 'interest' | 'link'; id: string } | null) => void; say: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [meta, setMeta] = useState<string | null>(null);
  async function findLinks() {
    setBusy(true); setMeta(null);
    try {
      const known = atlas.links.filter((l) => l.status !== 'suggested' || l.source !== 'sample').map((l) => [l.a, l.b].sort().join('|'));
      const res = await fetch('/api/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        interests: atlas.interests.map((i) => ({ id: i.id, name: i.name, goal: i.goal })), logs: atlas.logs.map((l) => ({ interestId: l.interestId, note: l.note })),
        resources: atlas.resources.map((r) => ({ interestId: r.interestId, title: r.title, note: r.note })), known }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      const fresh: Link[] = d.links.map((l: { a: string; b: string; reason: string; technique: string | null; score: number | null }) => ({ id: uid(), a: l.a, b: l.b, reason: l.reason, technique: l.technique, score: l.score, status: 'suggested', source: d.judge ?? 'local' }));
      edit((a) => ({ ...a, links: [...a.links.filter((l) => !(l.status === 'suggested' && fresh.some((f) => [f.a, f.b].sort().join() === [l.a, l.b].sort().join()))), ...fresh] }));
      setMeta(`Compared your notes with ${d.method === 'gemini-embeddings' ? 'Gemini embeddings' : 'TF-IDF word vectors'}, shortlisted ${d.considered} pairs${d.judge ? `, and ${d.judge === 'gemini' ? 'Gemini' : 'Groq'} kept ${fresh.length}` : `; no judge available, showing the ${fresh.length} strongest`}.`);
      if (!fresh.length) say('No new links this time. Log a few more sessions with notes and try again.');
    } catch (e) { say(e instanceof Error && e.message ? e.message : 'Couldn’t find links right now.'); }
    finally { setBusy(false); }
  }
  const interest = sel?.kind === 'interest' ? atlas.interests.find((i) => i.id === sel.id) : null;
  const link = sel?.kind === 'link' ? atlas.links.find((l) => l.id === sel.id) : null;
  const suggested = atlas.links.filter((l) => l.status === 'suggested').length;

  return (
    <main>
      <div className="toolbar">
        <h1>{atlas.interests.length} interests{suggested ? `, ${suggested} link${suggested === 1 ? '' : 's'} to look at` : ''}</h1>
        <div className="row">
          <button onClick={() => setAdding(true)}>Add an interest</button>
          <button className="primary" onClick={findLinks} disabled={busy || atlas.interests.length < 2}>{busy ? 'Reading your notes…' : 'Find links in my notes'}</button>
        </div>
      </div>
      {meta && <p className="meta">{meta}</p>}
      {adding && <AddInterest onCancel={() => setAdding(false)} onAdd={(i) => { edit((a) => ({ ...a, interests: [...a.interests, i] })); setAdding(false); setSel({ kind: 'interest', id: i.id }); }} count={atlas.interests.length} />}
      {atlas.interests.length ? (
        <div className="split">
          <Canvas atlas={atlas} selected={sel} onSelect={setSel} onMove={(id, x, y) => edit((a) => ({ ...a, interests: a.interests.map((i) => (i.id === id ? { ...i, x, y } : i)) }))} />
          <aside className="panel" aria-live="polite">
            {!interest && !link && <div className="hint-panel"><h2>How to read the map</h2><p>Each card is an interest. Dashed lines with a <b>?</b> are links Atlas found between your notes; tap one to see why, then keep or dismiss it. Kept links turn solid.</p><p>Drag cards to arrange them; drag the background to move around.</p></div>}
            {interest && <InterestPanel atlas={atlas} i={interest} edit={edit} close={() => setSel(null)} />}
            {link && (
              <div>
                <p className="kicker">{link.technique ?? 'Link'}</p>
                <h2>{linkLabel(link, atlas)}</h2>
                <p className="reason">{link.reason}</p>
                <p className="small">{link.source === 'sample' ? 'Sample link written for the demo. Use “Find links in my notes” to have the AI find its own.' : link.source === 'local' ? 'Found by matching words in your notes (no AI judge was available).' : `Found from your notes${link.score != null ? ` (similarity ${link.score})` : ''}, checked by ${link.source === 'gemini' ? 'Gemini' : 'Groq'}.`}</p>
                {link.status === 'suggested'
                  ? <div className="row"><button className="primary" onClick={() => edit((a) => ({ ...a, links: a.links.map((l) => (l.id === link.id ? { ...l, status: 'accepted' } : l)) }))}>Keep this link</button><button onClick={() => { edit((a) => ({ ...a, links: a.links.map((l) => (l.id === link.id ? { ...l, status: 'dismissed' } : l)) })); setSel(null); }}>Dismiss</button></div>
                  : <button className="link" onClick={() => edit((a) => ({ ...a, links: a.links.map((l) => (l.id === link.id ? { ...l, status: 'suggested' } : l)) }))}>Undo keep</button>}
              </div>
            )}
          </aside>
        </div>
      ) : <p className="empty">Add your first interest to start the map.</p>}
    </main>
  );
}

function AddInterest({ onAdd, onCancel, count }: { onAdd: (i: Interest) => void; onCancel: () => void; count: number }) {
  const [f, setF] = useState({ name: '', group: 'Creative' as Group, goal: '' });
  return (
    <form className="add" onSubmit={(e) => { e.preventDefault(); if (f.name.trim()) onAdd({ id: uid(), name: f.name.trim(), group: f.group, goal: f.goal.trim() || 'Set a goal', nextStep: '', x: 120 + (count % 3) * 330, y: 100 + Math.floor(count / 3) * 300, priority: 2, keywords: [] }); }}>
      <label><span>Interest</span><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Pottery" maxLength={40} /></label>
      <label><span>Kind</span><select value={f.group} onChange={(e) => setF({ ...f, group: e.target.value as Group })}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select></label>
      <label className="wide"><span>Goal</span><input value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} placeholder="What does good look like in 3 months?" maxLength={160} /></label>
      <div className="row"><button className="primary">Add</button><button type="button" className="link" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function InterestPanel({ atlas, i, edit, close }: { atlas: Atlas; i: Interest; edit: (f: (a: Atlas) => Atlas) => void; close: () => void }) {
  const s = stats(atlas, i.id);
  const logs = atlas.logs.filter((l) => l.interestId === i.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const set = (p: Partial<Interest>) => edit((a) => ({ ...a, interests: a.interests.map((x) => (x.id === i.id ? { ...x, ...p } : x)) }));
  const links = atlas.links.filter((l) => l.status === 'accepted' && (l.a === i.id || l.b === i.id));
  return (
    <div>
      <p className={`kicker g-${i.group}`}>{i.group}</p>
      <h2>{i.name}</h2>
      <p className="nums"><b>{hrs(s.minutes)}</b> in 30 days · {s.sessions} sessions · {s.streak ? `${s.streak}-day streak` : s.daysSince != null ? `last session ${s.daysSince} days ago` : 'no sessions yet'}</p>
      <label className="field"><span>Goal</span><input value={i.goal} onChange={(e) => set({ goal: e.target.value })} /></label>
      <label className="field"><span>Next step</span><input value={i.nextStep} onChange={(e) => set({ nextStep: e.target.value })} placeholder="The very next thing to practise" /></label>
      <div className="field"><span>Priority this month</span><div className="prio">{([1, 2, 3] as const).map((p) => <button key={p} className={i.priority >= p ? 'on' : ''} onClick={() => set({ priority: p })} aria-label={`Priority ${p} of 3`}>●</button>)}</div></div>
      {links.length > 0 && <><h3>Kept links</h3><ul className="mini-list">{links.map((l) => <li key={l.id}>{linkLabel(l, atlas)}: {l.technique}</li>)}</ul></>}
      <h3>Recent sessions</h3>
      <ul className="mini-list">{logs.map((l) => <li key={l.id}><span>{l.note || 'Session'}</span><time>{hrs(l.minutes)} · {new Date(l.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</time></li>)}</ul>
      <div className="row"><button className="link" onClick={close}>Close</button><button className="link danger" onClick={() => { edit((a) => ({ ...a, interests: a.interests.filter((x) => x.id !== i.id), logs: a.logs.filter((l) => l.interestId !== i.id), links: a.links.filter((l) => l.a !== i.id && l.b !== i.id) })); close(); }}>Remove this interest</button></div>
    </div>
  );
}

function Week({ atlas, edit }: { atlas: Atlas; edit: (f: (a: Atlas) => Atlas) => void }) {
  const plan = useMemo(() => planWeek(atlas), [atlas]);
  const name = (id: string) => atlas.interests.find((i) => i.id === id);
  return (
    <main>
      <h1>This week</h1>
      <p className="lede">Tell Atlas your free time; it spreads sessions across your interests by priority, gives extra time to anything that has gone quiet, and never puts the same thing twice in a day.</p>
      <div className="free">{DAYS.map((d, k) => <label key={d}><span>{d}</span><input type="number" min="0" max="600" step="15" value={atlas.freeMinutes[k]} onChange={(e) => edit((a) => ({ ...a, freeMinutes: a.freeMinutes.map((m, j) => (j === k ? Math.max(0, Number(e.target.value) || 0) : m)) }))} aria-label={`Free minutes on ${d}`} /><small>min</small></label>)}</div>
      {plan.neglected.length > 0 && <p className="callout">Gone quiet: {plan.neglected.map((id) => { const s = stats(atlas, id); return `${name(id)?.name} (${s.daysSince == null ? 'never logged' : `${s.daysSince} days`})`; }).join(', ')}. This week’s plan makes room for {plan.neglected.length === 1 ? 'it' : 'them'}.</p>}
      <div className="weekgrid">{DAYS.map((d, k) => (
        <section key={d} className="day"><h2>{d}</h2>
          {plan.slots.filter((s) => s.day === k).map((s, j) => { const i = name(s.interestId)!; return <div key={j} className={`slot g-${i.group}`}><b>{i.name}</b><span>{s.minutes} min</span><small>{s.why}</small></div>; })}
          {!plan.slots.some((s) => s.day === k) && <p className="small">Rest day</p>}
        </section>))}</div>
    </main>
  );
}

function Review({ atlas }: { atlas: Atlas }) {
  const [ai, setAi] = useState<Record<string, { progress: string; suggestion: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const weeks = (id: string) => Array.from({ length: 12 }, (_, w) => { const end = Date.now() - w * 7 * 86400000, start = end - 7 * 86400000; return atlas.logs.filter((l) => l.interestId === id && Date.parse(l.date) > start && Date.parse(l.date) <= end).reduce((s, l) => s + l.minutes, 0); }).reverse();
  async function write() {
    setBusy(true); setErr(null);
    const items = atlas.interests.map((i) => { const s = stats(atlas, i.id); return { id: i.id, name: i.name, goal: i.goal, sessions: s.sessions, minutes: s.minutes, streak: s.streak, daysSince: s.daysSince, notes: atlas.logs.filter((l) => l.interestId === i.id).slice(-12).map((l) => l.note) }; });
    try { const r = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setAi(Object.fromEntries(d.reviews.map((x: { id: string; progress: string; suggestion: string }) => [x.id, x]))); }
    catch (e) { setErr(e instanceof Error && e.message ? e.message : 'Couldn’t write the review now.'); }
    finally { setBusy(false); }
  }
  return (
    <main>
      <div className="toolbar"><h1>The last 30 days</h1><button className="primary" onClick={write} disabled={busy || !atlas.interests.length}>{busy ? 'Writing…' : 'Write my monthly review'}</button></div>
      {err && <p className="callout">{err}</p>}
      <div className="reviews">{atlas.interests.map((i) => { const s = stats(atlas, i.id); const w = weeks(i.id); const max = Math.max(60, ...w);
        return (
          <article key={i.id} className={`rev g-${i.group}`}>
            <h2>{i.name}</h2>
            <p className="nums"><b>{hrs(s.minutes)}</b> · {s.sessions} sessions · {s.streak ? `${s.streak}-day streak` : `last ${s.daysSince ?? '–'} days ago`}</p>
            <svg className="bars" viewBox="0 0 120 32" role="img" aria-label={`Minutes per week, last 12 weeks: ${w.join(', ')}`}>{w.map((m, k) => <rect key={k} x={k * 10 + 1} y={32 - (m / max) * 30} width="8" height={Math.max(1, (m / max) * 30)} rx="1.5" />)}</svg>
            <p className="small">Minutes per week, last 12 weeks</p>
            {ai?.[i.id] ? <><p>{ai[i.id].progress}</p><p className="next"><b>Next month:</b> {ai[i.id].suggestion}</p></> : <p className="small">Goal: {i.goal}</p>}
          </article>
        ); })}</div>
    </main>
  );
}
