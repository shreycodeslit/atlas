// Finding candidate links between interests: compare every note of one interest with every note of another,
// using embeddings when available (Gemini) or TF-IDF word vectors as a free fallback.

export interface Doc { interestId: string; text: string }
export interface Candidate { a: string; b: string; score: number; examples: [string, string][]; sharedTerms: string[] }

const STOP = new Set('a an and the of to in on with for at by is it my i me we our your this that then than from as be was were are or not no do did done one two three into out up down very more most less min minutes h hour hours first last new next'.split(' '));
export const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9ñáéíóú\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));

export function tfidf(docs: string[]): Map<string, number>[] {
  const tf = docs.map((d) => { const m = new Map<string, number>(); for (const t of tokens(d)) m.set(t, (m.get(t) || 0) + 1); return m; });
  const df = new Map<string, number>();
  for (const m of tf) for (const t of m.keys()) df.set(t, (df.get(t) || 0) + 1);
  return tf.map((m) => {
    const v = new Map<string, number>();
    let norm = 0;
    for (const [t, c] of m) { const w = c * Math.log(1 + docs.length / (df.get(t) || 1)); v.set(t, w); norm += w * w; }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of v) v.set(t, w / norm);
    return v;
  });
}

export const cosineSparse = (a: Map<string, number>, b: Map<string, number>) => { let s = 0; for (const [t, w] of a) s += w * (b.get(t) || 0); return s; };
export const cosine = (a: number[], b: number[]) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; } return s / (Math.sqrt(na * nb) || 1); };

/** Best-matching note pairs across every two interests, strongest first. `sim(i, j)` compares docs i and j. */
export function candidates(docs: Doc[], sim: (i: number, j: number) => number, skip: Set<string>, limit = 8): Candidate[] {
  const byPair = new Map<string, { score: number; ex: [number, number][] }>();
  for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
    const a = docs[i].interestId, b = docs[j].interestId;
    if (a === b) continue;
    const key = [a, b].sort().join('|');
    if (skip.has(key)) continue;
    const s = sim(i, j);
    const cur = byPair.get(key) || { score: 0, ex: [] };
    cur.ex.push([i, j]); cur.ex.sort((x, y) => sim(y[0], y[1]) - sim(x[0], x[1])); cur.ex = cur.ex.slice(0, 2);
    cur.score = Math.max(cur.score, s);
    byPair.set(key, cur);
  }
  return [...byPair.entries()].sort((x, y) => y[1].score - x[1].score).slice(0, limit).map(([key, v]) => {
    const [a, b] = key.split('|');
    const ex = v.ex.map(([i, j]) => (docs[i].interestId === a ? [docs[i].text, docs[j].text] : [docs[j].text, docs[i].text]) as [string, string]);
    const ta = new Set(ex.flatMap(([x]) => tokens(x))), tb = new Set(ex.flatMap(([, y]) => tokens(y)));
    return { a, b, score: Math.round(v.score * 100) / 100, examples: ex, sharedTerms: [...ta].filter((t) => tb.has(t)).slice(0, 4) };
  });
}
