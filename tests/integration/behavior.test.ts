import { expect, it } from 'vitest';
import { parseEvents, computeFunnel, parseCsv, type Event } from '../../packages/adapters/behavior/src/index.js';
const event = (id: string, name: string, minute: number, sessionId = 's1', userId = 'u1'): Event => ({ id, name, timestamp: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(), sessionId, userId, platform: 'web' });
it('calcule [2,2,1], déduplique et remet les événements dans l’ordre', () => {
  const a = event('a', 'enter', 0), rows = [event('c', 'done', 2), a, event('b', 'act', 1), a, event('d', 'enter', 0, 's2'), event('e', 'act', 1, 's2')];
  const data = parseEvents(JSON.stringify(rows), 'json'); expect(data.duplicates).toBe(1);
  const f = computeFunnel(data.events, ['enter', 'act', 'done'], 1800000); expect(f.counts).toEqual([2, 2, 1]); expect(f.conversion).toBe(0.5);
});
it('respecte la fenêtre, les reprises et la distinction utilisateur/session', () => {
  const rows = [event('a', 'enter', 0), event('b', 'act', 45), event('c', 'enter', 50), event('d', 'act', 51), event('e', 'done', 52), event('f', 'enter', 0, 's1', 'u2')];
  expect(computeFunnel(rows, ['enter', 'act', 'done'], 1800000).counts).toEqual([2, 1, 1]);
  expect(computeFunnel([event('a', 'act', 0), event('b', 'enter', 1)], ['enter', 'act'], 1800000).counts).toEqual([1, 0]);
  expect(computeFunnel([], ['enter', 'act'], 100).conversion).toBeNull();
});
it('lit les virgules et retours cités, rejette les exports incorrects', () => {
  expect(parseCsv('a,b\r\n"premier, second","ligne\nsuivante"\r\n')).toEqual([{ a: 'premier, second', b: 'ligne\nsuivante' }]);
  expect(() => parseCsv('a,b\n"incomplet')).toThrow(); expect(() => parseCsv('a,b\n1,2,3')).toThrow(); expect(() => parseEvents('[{"timestamp":"hier"}]', 'json')).toThrow();
});
it('traite les entrées répétées et ne compte pas deux fois un même événement', () => {
  const repeated = Array.from({ length: 20000 }, (_, i) => event(String(i), 'enter', 0));
  expect(computeFunnel(repeated, ['enter', 'act', 'done'], 1800000).counts).toEqual([1, 0, 0]);
  expect(computeFunnel([event('1', 'a', 0), event('2', 'b', 1)], ['a', 'b', 'b'], 1800000).counts).toEqual([1, 1, 0]);
  expect(computeFunnel([event('1', 'a', 0), event('2', 'b', 1), event('3', 'b', 2)], ['a', 'b', 'b'], 1800000).counts).toEqual([1, 1, 1]);
});
