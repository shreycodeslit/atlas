// A sample polymath: six interests and three months of practice logs, generated the same way every time.
import { daysAgoIso, uid, type Atlas, type Interest, type Link, type Log, type Resource } from './types';

const I = (id: string, name: string, group: Interest['group'], x: number, y: number, priority: Interest['priority'], goal: string, nextStep: string, keywords: string[]): Interest =>
  ({ id, name, group, x, y, priority, goal, nextStep, keywords });

export const SAMPLE_INTERESTS: Interest[] = [
  I('guitar', 'Guitar', 'Creative', 110, 150, 3, 'Play a full song at the open mic in March', 'Clean barre-chord changes at 80 bpm', ['played', 'chords', 'strum', 'fretboard', 'song']),
  I('sketch', 'Sketching', 'Creative', 470, 190, 2, 'Fill one sketchbook with urban scenes', 'Ten 30-second gesture drawings a day', ['sketch', 'drew', 'drawing', 'ink', 'perspective']),
  I('chess', 'Chess', 'Mind', 130, 470, 3, 'Reach 1600 rapid on Lichess', 'Rook endgame drills', ['chess', 'blitz', 'rapid', 'endgame', 'opening', 'tactics', 'puzzles']),
  I('spanish', 'Spanish', 'Mind', 470, 470, 2, 'Hold a 15-minute conversation by summer', 'Book an iTalki class', ['spanish', 'español', 'vocab', 'conjugation', 'italki']),
  I('running', 'Running', 'Body', 860, 150, 2, 'Run a sub-55 10k', 'Two easy runs and one interval session a week', ['ran', 'run', 'running', '5k', '10k', 'intervals', 'tempo']),
  I('investing', 'Investing', 'Money', 860, 470, 1, 'Understand every fund I own', 'Write down why I hold each SIP', ['invest', 'sip', 'portfolio', 'fund', 'stocks', 'compounding']),
];

const NOTES: Record<string, string[]> = {
  guitar: ['Barre chords with a metronome at 70 bpm', 'Spaced repetition of chord changes: the hard ones first', 'Learned a flamenco rumba strum', 'Transcribed a short solo by ear', 'Scales slow, then 10 bpm faster (deliberate practice)', 'Played the full song once without stopping'],
  sketch: ['Urban sketching at Sector 29 market', 'Gesture drawing, 30-second poses, timed', 'Two-point perspective drills', 'Copied a master study in ink', 'Ink only, no pencil, no erasing', 'Daily 10-minute sketch habit'],
  chess: ['Rook endgame drills with spaced repetition flashcards', 'Timed tactics puzzles, 15 minutes', 'Analysed my blitz losses: most were time pressure decisions', 'Studied pawn structures', 'Visualisation exercise: played a line without the board', 'Opening repertoire flashcards in Anki'],
  spanish: ['Anki flashcards, 20 new words', 'Listened to a Spanish podcast about flamenco', 'Shadowing a native speaker for pronunciation', 'Conversation class on iTalki', 'Read a short story in Spanish', 'Verb conjugation drills, preterite'],
  running: ['Easy 5k in zone 2, breathing in a 3-3 rhythm', 'Intervals: 6 × 400 m', 'Long run, 12 km', 'Cadence drill with a metronome at 170 bpm', 'Recovery run, very easy', 'Tempo run, 20 minutes'],
  investing: ['Read about compounding and index funds', 'Reviewed my SIP portfolio', 'Studied position sizing and risk', 'Journaled why I chose a tax-saving fund', 'Learned about expected value in decisions', 'Read a chapter of The Psychology of Money'],
};
const EVERY: Record<string, [number, number, number]> = { guitar: [2, 30, 45], sketch: [3, 15, 30], chess: [2, 25, 50], spanish: [3, 15, 30], running: [3, 30, 70], investing: [7, 30, 60] };

function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

export function sampleAtlas(now = new Date()): Atlas {
  const r = rng(42);
  const logs: Log[] = [];
  for (const i of SAMPLE_INTERESTS) {
    const [gap, min, max] = EVERY[i.id];
    let k = 0;
    for (let d = 90; d >= 0; d -= Math.max(1, Math.round(gap * (0.6 + r() * 0.8)))) {
      if (i.id === 'spanish' && d < 17) continue; // Spanish has gone quiet: the planner should notice
      const notes = NOTES[i.id];
      logs.push({ id: uid(), interestId: i.id, date: daysAgoIso(d, now), minutes: Math.round((min + r() * (max - min)) / 5) * 5, note: notes[k++ % notes.length] });
    }
  }
  const resources: Resource[] = [
    { id: uid(), interestId: 'chess', title: 'Silman’s Complete Endgame Course', url: null, note: 'Working through the rook endings chapter' },
    { id: uid(), interestId: 'guitar', title: 'Justin Guitar: barre chords module', url: 'https://www.justinguitar.com', note: '' },
    { id: uid(), interestId: 'spanish', title: 'Anki deck: 2,000 most common Spanish words', url: null, note: '' },
    { id: uid(), interestId: 'investing', title: 'The Psychology of Money', url: null, note: 'Chapter 6 next' },
  ];
  const L = (a: string, b: string, reason: string, technique: string): Link => ({ id: uid(), a, b, reason, technique, status: 'suggested', source: 'sample', score: null });
  const links: Link[] = [
    L('chess', 'spanish', 'Both run on flashcards with spaced repetition. One daily Anki session for endgames and vocabulary saves a context switch.', 'Spaced repetition'),
    L('guitar', 'running', 'Metronome work in both: chord changes at 70–80 bpm and cadence drills at 170 bpm train the same sense of steady rhythm.', 'Rhythm training'),
    L('guitar', 'spanish', 'Flamenco rumba on guitar and a Spanish flamenco podcast: learning a song with Spanish lyrics practises both at once.', 'Shared material'),
    L('chess', 'investing', 'Your blitz losses were time-pressure decisions, and you are journaling fund choices. One decision journal for both builds the same habit.', 'Decision journal'),
    L('sketch', 'chess', 'Timed gesture drawing and board visualisation both train seeing a whole picture quickly. Short timed drills suit both.', 'Timed drills'),
  ];
  return { interests: SAMPLE_INTERESTS.map((i) => ({ ...i })), logs, resources, links, freeMinutes: [60, 45, 60, 45, 60, 150, 150], demo: true };
}
