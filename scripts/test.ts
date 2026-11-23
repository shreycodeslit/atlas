// Tests: log parsing, the weekly planner, and the links pipeline (with TF-IDF and a scripted judge).
import { parseLog, planWeek, stats } from '../src/lib/logic';
import { sampleAtlas } from '../src/lib/sample';

let fails = 0;
const ok = (c: unknown, l: string) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${l}`); if (!c) fails++; };
const a = sampleAtlas(new Date());

const p1 = parseLog('guitar 40 min barre chords', a.interests);
ok(p1.interestId === 'guitar' && p1.minutes === 40 && /barre/i.test(p1.note), 'log: "guitar 40 min barre chords"');
const p2 = parseLog('ran 5k in 32 minutes, felt easy', a.interests);
ok(p2.interestId === 'running' && p2.minutes === 32, 'log: matched by keyword ("ran")');
const p3 = parseLog('1.5 h endgame study', a.interests);
ok(p3.interestId === 'chess' && p3.minutes === 90, 'log: hours and a keyword ("endgame")');
ok(parseLog('baked bread for an hour', a.interests).interestId === null, 'log: unknown interest is left for the user to pick');

const sp = stats(a, 'spanish');
ok(sp.daysSince !== null && sp.daysSince >= 14, 'Spanish has gone quiet in the sample (no session for 2+ weeks)');
const w = planWeek(a);
const total = w.slots.reduce((s, x) => s + x.minutes, 0);
ok(total <= a.freeMinutes.reduce((s, m) => s + m, 0), 'plan never exceeds the free time');
ok([0, 1, 2, 3, 4, 5, 6].every((d) => w.slots.filter((s) => s.day === d).reduce((s, x) => s + x.minutes, 0) <= a.freeMinutes[d]), 'plan fits each day');
ok(w.neglected.includes('spanish') && w.slots.some((s) => s.interestId === 'spanish' && s.why === 'Picking it back up'), 'neglected Spanish gets a session to pick it back up');
ok(!w.slots.some((s, i) => w.slots.some((t, j) => j !== i && t.day === s.day && t.interestId === s.interestId)), 'no interest twice on one day');

// Links pipeline with no embedding key: TF-IDF shortlist, then a scripted judge
process.env.GROQ_API_KEY = 'fake';
let judgeInput = '';
globalThis.fetch = (async (url: string, init: RequestInit) => {
  if (String(url).includes('groq.com')) {
    judgeInput = String(init.body);
    const cands = JSON.parse(JSON.parse(String(init.body)).messages[1].content) as { a: string; b: string }[];
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ links: cands.map((c, i) => ({ a: c.a, b: c.b, useful: i < 3, reason: 'Because.', technique: 'Test' })) }) } }] }), { status: 200 });
  }
  return new Response('{}', { status: 500 });
}) as typeof fetch;
const { default: links } = await import('../api/links');
const body = { interests: a.interests.map((i) => ({ id: i.id, name: i.name, goal: i.goal })), logs: a.logs.map((l) => ({ interestId: l.interestId, note: l.note })), resources: a.resources, known: ['chess|spanish'] };
const r = await links(new Request('http://x/api/links', { method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' }, body: JSON.stringify(body) }));
const d = await r.json();
ok(r.status === 200 && d.method === 'tf-idf' && d.judge === 'groq', 'falls back to TF-IDF without an embedding key, judged by Groq');
ok(d.links.length === 3 && d.considered >= 5, 'judge keeps only the useful candidates');
ok(!judgeInput.includes('"a":"chess","a_name":"Chess","b":"spanish"'), 'pairs the user already accepted or dismissed are not suggested again');
const top = JSON.parse(JSON.parse(judgeInput).messages[1].content)[0];
console.log('   strongest TF-IDF candidate:', top.a_name, '↔', top.b_name, top.similarity, JSON.stringify(top.notes[0]));

console.log(fails ? `\n${fails} failed` : '\nAll passed');
process.exit(fails ? 1 : 0);
