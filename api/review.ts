// POST /api/review { items: [{ id, name, goal, sessions, minutes, streak, daysSince, notes }] } → a short review per interest
import { z } from 'zod';
import { generateJson, json, rateLimited, respondLater } from './_lib/ai';

export const config = { runtime: 'edge' };

const Item = z.object({ id: z.string(), name: z.string().max(60), goal: z.string().max(200), sessions: z.number(), minutes: z.number(), streak: z.number(), daysSince: z.number().nullable(), notes: z.array(z.string().max(300)).max(40) });
const Reply = z.object({ reviews: z.array(z.object({ id: z.string(), progress: z.string().max(400), suggestion: z.string().max(300) })).max(20) });

// Answers start streaming at once, so a slow free-tier model can't hit the Edge 25-second start limit
export default function handler(req: Request): Response {
  return respondLater(() => handle(req));
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (rateLimited(req, 6, 10 * 60_000)) return json({ error: 'Reviews are limited to a few every 10 minutes.' }, 429);
  const p = z.object({ items: z.array(Item).min(1).max(20) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: 'Send the interests to review.' }, 400);
  const system = `You write a short monthly review for each of someone's interests, from their own practice log. For each item:
progress: 1–2 sentences on what they actually did and how it moves them toward the goal, using their numbers (sessions, hours, streak). Be honest if it has gone quiet.
suggestion: one concrete next step for the coming month, sized to their real pace.
Plain, warm, specific; no generic advice. Return JSON {"reviews": [{"id", "progress", "suggestion"}]} with the ids as given.`;
  try {
    const r = await generateJson(system, JSON.stringify(p.data.items), (raw) => Reply.parse(raw));
    return json({ reviews: r.data.reviews, provider: r.provider });
  } catch {
    return json({ error: 'The reviewer is busy or out of free quota. Your numbers are still shown.' }, 503);
  }
}
