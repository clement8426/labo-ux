import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlanSchema, OutputSchema, type Check } from '../../packages/contracts/src/index.js';
import { AuditEngine, validateRegistry, eligibility } from '../../packages/core/src/index.js';
import { define, output } from '../../packages/checks/src/helpers.js';
import { writeReports, html } from '../../packages/reports/src/index.js';

let root: string, out: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'labo-ux-test-')); out = join(root, '.labo-ux'); await writeFile(join(root, 'index.html'), '<h1>Fixture</h1>'); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const plan = () => PlanSchema.parse({ projectRoot: root, outputDir: out, confirmed: true, targets: [{ id: 'web', kind: 'web' }, { id: 'android', kind: 'android' }], timeoutMs: 60 });
const good = (id: string, options: Partial<Check> = {}) => define(id, 'microcopy', async () => output({ evidence: [{ id: 'p', kind: 'source-analysis', summary: 'preuve' }] }), options);
describe('isolation et persistance', () => {
  it('continue après exception, délai, résultat invalide et dépendance indisponible', async () => {
    const registry = [good('healthy'), define('crash', 'performance', async () => { throw new Error('broken'); }),
      define('timeout', 'friction', async () => new Promise(() => {})),
      define('invalid', 'design-system', async () => ({ measurements: [{ value: NaN }] }) as any),
      good('blocked', { requiredDependencies: ['crash'] }), good('optional', { optionalDependencies: ['crash'] })];
    const engine = new AuditEngine(registry, out), state = await engine.create(plan()), done = await engine.execute(state.id);
    expect(done.status).toBe('partial'); const { results } = await engine.store.results(state.id);
    expect(results).toHaveLength(12);
    const statuses = Object.fromEntries(results.filter(r => r.targetId === 'web').map(r => [r.nodeId, r.executionStatus]));
    expect(statuses).toEqual({ healthy: 'completed', crash: 'error', timeout: 'timed-out', invalid: 'error', blocked: 'skipped', optional: 'completed' });
    const reports = await writeReports(engine.store, state.id); expect(reports.errors).toEqual([]); expect(reports.files).toHaveLength(3);
    expect(await readFile(join(engine.store.dir(state.id), 'report.md'), 'utf8')).toContain('broken');
  });
  it('conserve un constat produit comme exécution réussie', async () => {
    const registry = [define('defect', 'accessibility', async () => OutputSchema.parse({ evidence: [{ id: 'e', kind: 'measurement', summary: 'contraste mesuré' }], findings: [{ id: 'f', severity: 'major', title: 'Contraste insuffisant', description: 'ratio mesuré', recommendation: 'Ajuster', confidence: 'confirmed', evidenceIds: ['e'] }] }))];
    const engine = new AuditEngine(registry, out), s = await engine.create(plan()); expect((await engine.execute(s.id)).status).toBe('completed');
    expect((await engine.store.results(s.id)).results[0]?.findings).toHaveLength(1);
  });
  it('ne réessaie que les erreurs transitoires idempotentes et garde les tentatives', async () => {
    let count = 0;
    const registry = [define('retry', 'microcopy', async () => { if (++count === 1) throw new Error('ECONNRESET'); return output(); }, { retryPolicy: { maxAttempts: 2, transientErrors: ['ECONNRESET'], idempotent: true } })];
    const p = plan(); p.targets = [p.targets[0]!]; const engine = new AuditEngine(registry, out), s = await engine.create(p); await engine.execute(s.id);
    const r = (await engine.store.results(s.id)).results[0]!; expect(r.executionStatus).toBe('completed'); expect(r.attempts).toHaveLength(2); expect(r.unstable).toBe(true); expect(r.error).toBeUndefined();
  });
  it('ne rejoue pas les résultats achevés ; isole les fichiers corrompus', async () => {
    let count = 0; const registry = [define('once', 'microcopy', async () => { count++; return output(); }), good('second')];
    const engine = new AuditEngine(registry, out), s = await engine.create(plan()); await engine.execute(s.id); expect(count).toBe(2);
    await writeFile(join(engine.store.dir(s.id), 'results', 'web--second.json'), '{corrupt');
    await engine.execute(s.id, undefined, true); expect(count).toBe(2);
    const report = await engine.store.results(s.id); expect(report.results).toHaveLength(4); expect((await engine.store.state(s.id)).limitations.join()).toContain('corrompu');
    await writeFile(join(root, 'index.html'), 'code changé'); await expect(engine.execute(s.id, undefined, true)).rejects.toThrow('Sources modifiées');
  });
  it('annule les nœuds actifs et en attente en conservant leurs états', async () => {
    const registry = [define('slow', 'microcopy', async () => new Promise(() => {})), good('other')], engine = new AuditEngine(registry, out), s = await engine.create(plan()), controller = new AbortController();
    controller.abort(); expect((await engine.execute(s.id, controller.signal)).status).toBe('cancelled');
    expect((await engine.store.results(s.id)).results.every(r => r.executionStatus === 'cancelled')).toBe(true);
  });
  it('sérialise un appareil partagé et isole les mesures lourdes', async () => {
    let active = 0, max = 0;
    const registry = [define('device', 'friction', async () => { max = Math.max(max, ++active); await new Promise(r => setTimeout(r, 10)); active--; return output(); }, { resourceRequirements: ['device'] })];
    const p = plan(); p.targets.forEach(t => { t.deviceId = 'shared'; }); const engine = new AuditEngine(registry, out), s = await engine.create(p); await engine.execute(s.id); expect(max).toBe(1);
  });
  it('refuse une seconde exécution simultanée', async () => {
    const engine = new AuditEngine([good('one')], out), s = await engine.create(plan()); const release = await engine.store.lock(s.id);
    await expect(engine.execute(s.id)).rejects.toThrow('déjà actif'); await release();
  });
  it('ne rejoue pas un parcours à effet de bord interrompu avant son résultat', async () => {
    let sideEffects = 0;
    const registry = [define('mutating', 'friction', async () => { sideEffects++; return output(); }, { retryPolicy: { maxAttempts: 1, transientErrors: [], idempotent: false } }), good('independent')];
    const engine = new AuditEngine(registry, out), s = await engine.create(plan());
    expect((await engine.store.state(s.id)).status).toBe('interrupted');
    await engine.store.event(s.id, { type: 'node-started', targetId: 'web', nodeId: 'mutating' });
    await engine.execute(s.id, undefined, true);
    expect(sideEffects).toBe(1); // The untouched Android target may start; the interrupted web target must not.
    const results = (await engine.store.results(s.id)).results;
    expect(results.find(r => r.targetId === 'web' && r.nodeId === 'mutating')?.executionStatus).toBe('skipped');
    expect(results.find(r => r.targetId === 'web' && r.nodeId === 'independent')?.executionStatus).toBe('completed');
  });
  it('génère JSON et Markdown même si HTML ne peut pas être écrit', async () => {
    const engine = new AuditEngine([good('one')], out), s = await engine.create(plan()); await engine.execute(s.id);
    await mkdir(join(engine.store.dir(s.id), 'report.html')); const report = await writeReports(engine.store, s.id); expect(report.files).toHaveLength(2); expect(report.errors[0]).toContain('report.html');
  });
  it('échappe le contenu de projet dans le rapport HTML', async () => {
    const engine = new AuditEngine([good('one')], out), p = plan(); p.objective = '<script>alert(1)</script>'; const s = await engine.create(p);
    const body = html({ schemaVersion: '1', state: s, results: [], limitations: [] }); expect(body).not.toContain('<script>alert'); expect(body).toContain('&lt;script&gt;');
  });
});
describe('planification', () => {
  it('rejette les cycles et dépendances inconnues', () => {
    expect(() => validateRegistry([good('a', { requiredDependencies: ['b'] }), good('b', { requiredDependencies: ['a'] })])).toThrow('Cycle');
    expect(() => validateRegistry([good('a', { requiredDependencies: ['absent'] })])).toThrow('inconnue');
  });
  it('distingue non applicable et prérequis manquant', () => {
    const c = good('web-only', { supportedTargets: ['web'], requiredCapabilities: ['runtime.browser'] });
    expect(eligibility(c, plan().targets[1]!, []).status).toBe('not-applicable'); expect(eligibility(c, plan().targets[0]!, []).status).toBe('skipped');
  });
  it('refuse un plan non confirmé et les preuves inventées', async () => {
    const p = plan(); p.confirmed = false; await expect(new AuditEngine([good('a')], out).create(p)).rejects.toThrow('confirmé');
    expect(() => OutputSchema.parse({ findings: [{ id: 'f', severity: 'info', title: '', description: '', recommendation: '', confidence: 'confirmed', evidenceIds: ['invented'] }] })).toThrow();
  });
});
