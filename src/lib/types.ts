export const GROUPS = ['Creative', 'Mind', 'Body', 'Money', 'Other'] as const;
export type Group = typeof GROUPS[number];

export interface Interest { id: string; name: string; group: Group; goal: string; nextStep: string; x: number; y: number; priority: 1 | 2 | 3; keywords: string[] }
export interface Log { id: string; interestId: string; date: string; minutes: number; note: string }
export interface Resource { id: string; interestId: string; title: string; url: string | null; note: string }
export interface Link { id: string; a: string; b: string; reason: string; technique: string | null; status: 'suggested' | 'accepted' | 'dismissed'; source: 'sample' | 'gemini' | 'groq' | 'local'; score: number | null }
export interface Atlas { interests: Interest[]; logs: Log[]; resources: Resource[]; links: Link[]; freeMinutes: number[]; demo: boolean }

export const uid = () => Math.random().toString(36).slice(2, 9);
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const daysAgoIso = (n: number, from = new Date()) => new Date(from.getTime() - n * 86400000).toISOString().slice(0, 10);
export const hrs = (min: number) => (min >= 60 ? `${Math.round((min / 60) * 10) / 10} h` : `${min} min`);
