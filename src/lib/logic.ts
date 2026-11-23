// The plain-code half of Atlas: reading a quick log line, streaks and stats, and the weekly planner.
import { daysAgoIso, todayIso, uid, type Atlas, type Interest, type Log } from './types';

/** "guitar 40 min barre chords" / "ran 5k, 32 minutes" / "1.5 h chess endgames" → which interest, how long, what. */
export function parseLog(text: string, interests: Interest[]): { interestId: string | null; minutes: number | null; note: string } {
  const t = text.trim();
  let minutes: number | null = null;
  const m = t.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|ghante?)\b|(\d+)\s*(m|min|mins|minutes|minute)\b/i);
  if (m) minutes = m[1] ? Math.round(parseFloat(m[1]) * 60) : Number(m[3]);
  const lower = t.toLowerCase();
  let best: Interest | null = null, bestScore = 0;
  for (const i of interests) {
    const words = [i.name.toLowerCase(), ...i.keywords.map((k) => k.toLowerCase())];
    const score = words.reduce((s, w) => s + (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(lower) ? (w === i.name.toLowerCase() ? 3 : 1) : 0), 0);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  const note = t.replace(m?.[0] ?? '', '').replace(best ? new RegExp(`\\b${best.name}\\b`, 'i') : /$^/, '').replace(/^[\s,:;-]+|[\s,:;-]+$/g, '').replace(/\s{2,}/g, ' ');
  return { interestId: best?.id ?? null, minutes, note: note ? note[0].toUpperCase() + note.slice(1) : '' };
}

export function stats(a: Atlas, interestId: string, days = 30) {
  const since = daysAgoIso(days);
  const logs = a.logs.filter((l) => l.interestId === interestId);
  const recent = logs.filter((l) => l.date >= since);
  const dates = new Set(logs.map((l) => l.date));
  // Consecutive days with a session, ending today (or yesterday, so a streak isn't lost before today's session)
  let streak = 0;
  for (let d = dates.has(todayIso()) ? 0 : 1; d < 400 && dates.has(daysAgoIso(d)); d++) streak++;
  const last = logs.map((l) => l.date).sort().at(-1) ?? null;
  const daysSince = last ? Math.round((Date.parse(todayIso()) - Date.parse(last)) / 86400000) : null;
  return { sessions: recent.length, minutes: recent.reduce((s, l) => s + l.minutes, 0), streak, last, daysSince };
}

export interface Slot { day: number; interestId: string; minutes: number; why: string }

/**
 * Spreads this week's free time across interests by priority, gives extra time to ones that have gone quiet,
 * and never puts the same interest twice on one day. Days are 0 = Monday … 6 = Sunday.
 */
export function planWeek(a: Atlas): { slots: Slot[]; neglected: string[] } {
  const total = a.freeMinutes.reduce((s, m) => s + m, 0);
  const weights = a.interests.map((i) => {
    const s = stats(a, i.id, 30);
    const quiet = s.daysSince == null || s.daysSince >= 14;
    return { i, w: i.priority * (quiet ? 1.5 : 1), quiet };
  });
  const sumW = weights.reduce((s, x) => s + x.w, 0) || 1;
  const want = new Map(weights.map(({ i, w }) => [i.id, Math.round(((total * w) / sumW) / 15) * 15]));
  const left = [...a.freeMinutes];
  const slots: Slot[] = [];
  for (let round = 0; round < 7; round++) {
    const order = [...weights].sort((x, y) => (want.get(y.i.id)! - want.get(x.i.id)!));
    for (const { i, quiet } of order) {
      const need = want.get(i.id)!;
      if (need < 20) continue;
      const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => left[d] >= 20 && !slots.some((s) => s.day === d && s.interestId === i.id))
        .sort((d1, d2) => slotsOn(slots, d1) - slotsOn(slots, d2) || left[d2] - left[d1]);
      const d = days[0];
      if (d === undefined) continue;
      const len = Math.min(need, left[d], i.priority === 3 ? 60 : 45);
      if (len < 20) continue;
      slots.push({ day: d, interestId: i.id, minutes: len, why: quiet ? 'Picking it back up' : i.priority === 3 ? 'Top priority' : 'Keeping it going' });
      left[d] -= len; want.set(i.id, need - len);
    }
  }
  return { slots: slots.sort((x, y) => x.day - y.day), neglected: weights.filter((x) => x.quiet).map((x) => x.i.id) };
}
const slotsOn = (s: Slot[], d: number) => s.filter((x) => x.day === d).length;

export function addLog(a: Atlas, interestId: string, minutes: number, note: string, date = todayIso()): Atlas {
  const log: Log = { id: uid(), interestId, minutes, note, date };
  return { ...a, logs: [...a.logs, log] };
}
