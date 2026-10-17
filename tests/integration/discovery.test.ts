import { expect, it } from 'vitest';
import { discoverTargets } from '../../packages/project-discovery/src/index.js';
import { PlanSchema, JourneySchema } from '../../packages/contracts/src/index.js';
import { quotePosix } from '../../packages/adapters/ssh/src/index.js';
const snapshot = (files: { path: string; content: string }[]) => ({ files, fingerprint: '', limitations: [] });
it('détecte web et cibles multiplateformes sans les déclarer exécutables', () => {
  const targets = discoverTargets(snapshot([
    { path: 'web/package.json', content: '{"dependencies":{"next":"1","react":"1"}}' },
    { path: 'mobile/package.json', content: '{"dependencies":{"react-native":"1","react":"1","expo":"1"}}' },
    { path: 'flutter/pubspec.yaml', content: 'dependencies:\n  flutter:\n    sdk: flutter' }
  ]));
  expect(targets.map(t => `${t.root}:${t.kind}`)).toEqual(['web:web', 'mobile:android', 'mobile:ios', 'flutter:android', 'flutter:ios']);
});
it('une technologie inconnue et un manifeste invalide conservent une analyse générique', () => {
  expect(discoverTargets(snapshot([{ path: 'package.json', content: '{invalid' }]))[0]?.technology).toEqual(['unknown']);
});
it('rejette les parcours arbitraires, sélecteurs ambigus et cibles inconnues', () => {
  const journey = { id: 'j', name: 'parcours', targetId: 'absent', preconditions: ['test'], expectedOutcome: 'fini', steps: [{ action: 'evaluate', value: 'process.exit()' }] };
  expect(() => JourneySchema.parse(journey)).toThrow();
  expect(() => JourneySchema.parse({ ...journey, steps: [{ action: 'activate', locator: { testId: 'a', text: 'b' } }] })).toThrow();
  expect(() => PlanSchema.parse({ projectRoot: '.', targets: [{ id: 'web', kind: 'web' }], journeys: [{ ...journey, steps: [{ action: 'open-target' }] }] })).toThrow();
});
it('quote les chemins SSH comme données POSIX et refuse les hôtes optionnels', () => {
  expect(quotePosix("/srv/l'atelier; echo secret")).toBe("'/srv/l'\\''atelier; echo secret'");
  expect(() => PlanSchema.parse({ projectRoot: '.', targets: [{ id: 'web', kind: 'web' }], source: { mode: 'ssh', host: '-oProxyCommand=bad', remoteRoot: '/srv' } })).toThrow();
});
