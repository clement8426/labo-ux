import { it, expect } from 'vitest';
import { PlanSchema, ResultSchema, blocks, type RunState } from '../../packages/contracts/src/index.js';
import { renderClientHtml } from '../../packages/reports/src/client.js';
import { html, type Report } from '../../packages/reports/src/index.js';
import { publicUrl } from '../../packages/adapters/web/src/browser-diagnostics.js';

it('garde six blocs UX et sépare les contrôles techniques dans le rapport', () => {
  const plan = PlanSchema.parse({ projectRoot: '.', targets: [{ id: 'web', kind: 'web' }] });
  expect(blocks).toHaveLength(6); expect(plan.blocks).toContain('technical');
  const state: RunState = { id: 'test', schemaVersion: '1', status: 'partial', plan, fingerprint: 'source-test', startedAt: '2026-10-21T10:00:00Z', versions: {}, capabilities: {}, checkVersions: {}, limitations: [] };
  const result = ResultSchema.parse({ schemaVersion: '1', runId: 'test', nodeId: 'technical.measure-memory', nodeVersion: '1', targetId: 'web', block: 'technical', executionStatus: 'completed', durationMs: 1, findings: [], measurements: [], evidence: [], limitations: ['Pas un test de fuite'], toolVersions: {}, attempts: [] });
  const report: Report = { schemaVersion: '1', state, results: [result], limitations: [] };
  expect(html(report)).toContain('PDF client'); expect(html(report)).toContain('Mémoire JavaScript et DOM');
  expect(renderClientHtml(report)).toContain('Diagnostics techniques complémentaires');
  expect(renderClientHtml(report)).toContain('Pas un test de fuite');
});

it('le document client conserve les états, les preuves et les hypothèses sans exécuter du contenu', () => {
  const plan = PlanSchema.parse({ projectRoot: '.', targets: [{ id: 'web', kind: 'web' }] });
  const state: RunState = { id: 'test', schemaVersion: '1', status: 'partial', plan, fingerprint: 'source-test', startedAt: '2026-10-21T10:00:00Z', versions: {}, capabilities: {}, checkVersions: {}, limitations: ['Couverture partielle'] };
  const make = (nodeId: string, confidence: 'confirmed' | 'hypothesis') => ResultSchema.parse({ schemaVersion: '1', runId: 'test', nodeId, nodeVersion: '1', targetId: 'web', block: 'accessibility', executionStatus: 'partial', durationMs: 1, findings: [{ id: 'label', title: 'Libellé absent', description: `${nodeId} <script>danger()</script>`, recommendation: 'Vérifier le contexte', confidence, severity: 'major', evidenceIds: ['proof'] }], measurements: [], evidence: [{ id: 'proof', kind: 'measurement', summary: 'preuve' }], limitations: ['État partiel'], toolVersions: {}, attempts: [] });
  const text = renderClientHtml({ schemaVersion: '1', state, results: [make('entry', 'confirmed'), make('dialog', 'confirmed'), make('source', 'hypothesis')], limitations: ['Couverture partielle'] }, new Map(), { client: '<img src=x onerror=bad()>' });
  expect((text.match(/<h3>\d+\. Libellé absent/g) ?? [])).toHaveLength(2);
  expect(text).toContain('entry / proof'); expect(text).toContain('dialog / proof'); expect(text).toContain('source / proof');
  expect(text).not.toContain('<script>'); expect(text).toContain('&lt;script&gt;'); expect(text).not.toContain('<img src=x');
});

it('retire identifiants, paramètres et fragments des URLs des diagnostics CDP', () => {
  expect(publicUrl('https://user:password@example.test/assets.js?token=secret#private')).toBe('https://example.test/assets.js');
});
