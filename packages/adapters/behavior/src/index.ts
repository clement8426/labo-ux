import { z } from 'zod';
export const EventSchema = z.object({ id: z.string().min(1), userId: z.string().min(1), sessionId: z.string().min(1), name: z.string().min(1), timestamp: z.string().datetime({ offset: true }), platform: z.string().default('unknown') });
export type Event = z.infer<typeof EventSchema>;
export function parseCsv(input: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') { if (quoted && input[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(value); value = ''; }
    else if (c === '\n' && !quoted) { row.push(value.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row); row = []; value = ''; }
    else value += c;
  }
  if (quoted) throw new Error('CSV : guillemet non fermé');
  if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  const headers = rows.shift()?.map(h => h.replace(/^\uFEFF/, ''));
  if (!headers || new Set(headers).size !== headers.length) throw new Error('En-têtes CSV absents ou dupliqués');
  return rows.map(r => { if (r.length !== headers.length) throw new Error('CSV : nombre de colonnes incohérent'); return Object.fromEntries(headers.map((h, i) => [h, r[i]!])); });
}
export function parseEvents(input: string, format: 'json' | 'csv') {
  const raw = format === 'csv' ? parseCsv(input) : JSON.parse(input);
  const parsed = z.array(EventSchema).max(200000).parse(raw), ids = new Set<string>(); let duplicates = 0;
  const events = parsed.filter(e => { if (ids.has(e.id)) { duplicates++; return false; } ids.add(e.id); return true; });
  return { events, duplicates };
}
export function computeFunnel(events: Event[], steps: string[], windowMs: number) {
  const sessions = new Map<string, Event[]>();
  for (const e of events) { const key = JSON.stringify([e.userId, e.sessionId, e.platform]); const s = sessions.get(key) ?? []; s.push(e); sessions.set(key, s); }
  const counts = steps.map(() => 0), segments: Record<string, number[]> = {};
  for (const session of sessions.values()) {
    session.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id));
    let best = 0;
    const latestStart = steps.map(() => Number.NEGATIVE_INFINITY);
    // The latest entry reaching a stage dominates older entries for a fixed window.
    // Descending updates prevent one event from satisfying two equal adjacent steps.
    for (const event of session) {
      const time = Date.parse(event.timestamp);
      for (let stage = steps.length - 1; stage >= 1; stage--) {
        const start = latestStart[stage - 1]!;
        if (event.name === steps[stage] && time - start <= windowMs) {
          latestStart[stage] = Math.max(latestStart[stage]!, start); best = Math.max(best, stage + 1);
        }
      }
      if (event.name === steps[0]) { latestStart[0] = time; best = Math.max(best, 1); }
      if (best === steps.length) break;
    }
    const segment = segments[session[0]!.platform] ?? steps.map(() => 0);
    for (let i = 0; i < best; i++) { counts[i]!++; segment[i]!++; }
    segments[session[0]!.platform] = segment;
  }
  return { steps, counts, segments, sessions: sessions.size, users: new Set(events.map(e => e.userId)).size, conversion: counts[0] ? counts[counts.length - 1]! / counts[0] : null };
}
