// POST /api/links { interests, logs, resources, known: ["a|b", ...] } → suggested links between interests
// Retrieve, then judge: embeddings (or TF-IDF) shortlist note pairs across interests; the model keeps the useful ones and says why.
import { z } from 'zod';
import { generateJson, json, rateLimited, respondLater } from './_lib/ai';
import { candidates, cosine, cosineSparse, tfidf, type Candidate, type Doc } from '../src/lib/similar';

declare const process: { env: Record<string, string | undefined> };
export const config = { runtime: 'edge' };

const Body = z.object({
  interests: z.array(z.object({ id: z.string(), name: z.string().max(60), goal: z.string().max(200).optional().default('') })).min(2).max(20),
  logs: z.array(z.object({ interestId: z.string(), note: z.string().max(300) })).max(1500),
  resources: z.array(z.object({ interestId: z.string(), title: z.string().max(200), note: z.string().max(300).optional().default('') })).max(200).optional().default([]),
  known: z.array(z.string()).max(400).optional().default([]),
});

async function embed(texts: string[]): Promise<number[][]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('no key');
  const model = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ requests: texts.slice(i, i + 100).map((t) => ({ model: `models/${model}`, content: { parts: [{ text: t }] }, taskType: 'SEMANTIC_SIMILARITY', outputDimensionality: 256 })) }),
    });
    const body = await res.json() as { embeddings?: { values: number[] }[]; error?: { message?: string } };
    if (!res.ok || !body.embeddings) throw new Error(body.error?.message || `embed ${res.status}`);
    out.push(...body.embeddings.map((e) => e.values));
  }
  return out;
}

const Judged = z.object({ links: z.array(z.object({ a: z.string(), b: z.string(), useful: z.boolean(), reason: z.string().max(300), technique: z.string().max(40).nullable().catch(null) })).max(12) });

// Answers start streaming at once, so a slow free-tier model can't hit the Edge 25-second start limit
export default function handler(req: Request): Response {
  return respondLater(() => handle(req));
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (rateLimited(req, 6, 10 * 60_000)) return json({ error: 'Link finding is limited to a few runs every 10 minutes.' }, 429);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: 'Send interests and logs.' }, 400);
  const { interests, logs, resources, known } = p.data;
  const name = new Map(interests.map((i) => [i.id, i.name]));

  // One document per distinct note, plus goals and resources
  const seen = new Set<string>();
  const docs: Doc[] = [];
  const push = (interestId: string, text: string) => { const k = `${interestId}:${text.toLowerCase()}`; if (text.trim() && name.has(interestId) && !seen.has(k) && docs.filter((d) => d.interestId === interestId).length < 30) { seen.add(k); docs.push({ interestId, text: text.trim() }); } };
  for (const i of interests) if (i.goal) push(i.id, i.goal);
  for (const l of logs.slice(-600)) push(l.interestId, l.note);
  for (const r of resources) push(r.interestId, `${r.title}${r.note ? `: ${r.note}` : ''}`);

  let method = 'gemini-embeddings';
  let sim: (i: number, j: number) => number;
  try {
    const vecs = await embed(docs.map((d) => `${name.get(d.interestId)}: ${d.text}`));
    sim = (i, j) => cosine(vecs[i], vecs[j]);
  } catch {
    method = 'tf-idf';
    const v = tfidf(docs.map((d) => d.text));
    sim = (i, j) => cosineSparse(v[i], v[j]);
  }
  const cands: Candidate[] = candidates(docs, sim, new Set(known), 8);
  if (!cands.length) return json({ links: [], method, judge: null, considered: 0 });

  const system = `You help someone who pursues many interests see real connections between them: a shared technique, shared material, or one habit that serves two goals.
For each candidate pair, decide if the link is genuinely useful (it suggests something concrete to do differently), not just a surface word match.
Return JSON {"links": [{"a": id, "b": id, "useful": boolean, "reason": "1–2 sentences, specific to their notes, ending with what to try", "technique": "2–3 word label"}]}. Keep the ids exactly as given.`;
  const user = JSON.stringify(cands.map((c) => ({ a: c.a, a_name: name.get(c.a), b: c.b, b_name: name.get(c.b), similarity: c.score, notes: c.examples })));
  try {
    const r = await generateJson(system, user, (raw) => Judged.parse(raw));
    const valid = new Set(cands.map((c) => [c.a, c.b].sort().join('|')));
    const links = r.data.links.filter((l) => l.useful && valid.has([l.a, l.b].sort().join('|'))).slice(0, 5)
      .map((l) => ({ ...l, score: cands.find((c) => [c.a, c.b].sort().join('|') === [l.a, l.b].sort().join('|'))?.score ?? null }));
    console.log(JSON.stringify({ route: 'links', method, judge: r.provider, considered: cands.length, kept: links.length }));
    return json({ links, method, judge: r.provider, considered: cands.length });
  } catch {
    // No judge available: offer the strongest matches with a plain explanation
    const links = cands.slice(0, 3).map((c) => ({ a: c.a, b: c.b, useful: true, technique: c.sharedTerms[0] ?? null, score: c.score,
      reason: `Your notes overlap${c.sharedTerms.length ? ` on ${c.sharedTerms.slice(0, 3).join(', ')}` : ''}: “${c.examples[0][0]}” and “${c.examples[0][1]}”.` }));
    return json({ links, method, judge: null, considered: cands.length });
  }
}
