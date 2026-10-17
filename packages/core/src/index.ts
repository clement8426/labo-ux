import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import { OutputSchema, schemaVersion, type Check, type Context, type Plan, type Result, type RunState, type Snapshot, type Capability } from '../../contracts/src/index.js';
import { capabilitiesFor, snapshotForPlan } from '../../project-discovery/src/index.js';
import { targetSnapshot } from '../../adapters/source/src/index.js';
import { Store } from './store.js';
export { Store } from './store.js';

export function validateRegistry(checks: Check[]): void {
  const map = new Map(checks.map(c => [c.id, c]));
  if (map.size !== checks.length) throw new Error('Vérification dupliquée');
  const active = new Set<string>(), done = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id)) throw new Error(`Cycle de dépendances : ${id}`);
    if (done.has(id)) return;
    const c = map.get(id); if (!c) throw new Error(`Dépendance inconnue : ${id}`);
    if (!/^[\w.-]+$/.test(c.id)) throw new Error('Identifiant de nœud invalide');
    if (!Number.isInteger(c.retryPolicy.maxAttempts) || c.retryPolicy.maxAttempts < 1 || c.retryPolicy.maxAttempts > 5 || c.timeoutMs <= 0) throw new Error('Délai ou politique de reprise invalide');
    active.add(id); c.requiredDependencies.forEach(visit); active.delete(id); done.add(id);
  };
  checks.forEach(c => visit(c.id));
}
export function selectedChecks(plan: Plan, registry: Check[]): Check[] {
  validateRegistry(registry);
  if (plan.checks?.some(id => !registry.some(c => c.id === id))) throw new Error('Vérification sélectionnée inconnue');
  const ids = new Set(registry.filter(c => plan.blocks.includes(c.block) && (!plan.checks || plan.checks.includes(c.id))).map(c => c.id));
  const add = (id: string) => { for (const dep of registry.find(c => c.id === id)!.requiredDependencies) if (!ids.has(dep)) { ids.add(dep); add(dep); } };
  [...ids].forEach(add);
  return registry.filter(c => ids.has(c.id));
}
export function eligibility(check: Check, target: Plan['targets'][number], caps: Capability[]): { status: 'ready' | 'skipped' | 'not-applicable'; reason?: string } {
  if (!check.supportedTargets.includes(target.kind)) return { status: 'not-applicable', reason: `Contrôle incompatible avec ${target.kind}` };
  const missing = check.requiredCapabilities.filter(id => !caps.some(c => c.id === id && c.available));
  return missing.length ? { status: 'skipped', reason: missing.map(id => `${id} : ${caps.find(c => c.id === id)?.reason ?? 'capacité absente'}`).join('; ') } : { status: 'ready' };
}
export async function prepare(plan: Plan, registry: Check[]) {
  const snapshot = await snapshotForPlan(plan), checks = selectedChecks(plan, registry);
  const capabilities: RunState['capabilities'] = {};
  for (const t of plan.targets) capabilities[t.id] = await capabilitiesFor(t, plan, targetSnapshot(snapshot, t.root));
  return { snapshot, checks, capabilities, coverage: plan.targets.flatMap(t => checks.map(c => ({ targetId: t.id, nodeId: c.id, block: c.block, ...eligibility(c, t, capabilities[t.id]!) }))) };
}
export class AuditEngine {
  readonly store: Store;
  constructor(readonly registry: Check[], outputDir: string) { validateRegistry(registry); this.store = new Store(outputDir); }
  async create(plan: Plan): Promise<RunState> {
    if (!plan.confirmed) throw new Error('Le plan doit être confirmé avant exécution (confirmed: true)');
    const { snapshot, checks, capabilities } = await prepare(plan, this.registry);
    const state: RunState = { schemaVersion, id: randomUUID(), status: 'running', plan, fingerprint: snapshot.fingerprint, startedAt: new Date().toISOString(), capabilities,
      versions: { node: process.version, os: `${os.platform()} ${os.release()}`, kit: '0.1.0' }, limitations: snapshot.limitations,
      checkVersions: Object.fromEntries(checks.map(c => [c.id, c.version])) };
    await this.store.initialize(state); return state;
  }
  async execute(id: string, signal: AbortSignal = new AbortController().signal, resume = false): Promise<RunState> {
    const release = await this.store.lock(id);
    try { return await this.executeLocked(id, signal, resume); }
    catch (error) {
      const state = await this.store.state(id); state.status = 'interrupted'; state.limitations.push(String(error));
      await this.store.saveState(state); throw error;
    } finally { await release(); }
  }
  private async executeLocked(id: string, signal: AbortSignal, resume: boolean): Promise<RunState> {
    const state = await this.store.state(id), plan = state.plan;
    let snapshot: Snapshot;
    try { snapshot = await snapshotForPlan(plan); } catch (error) { state.status = 'partial'; state.limitations.push(`Source indisponible : ${String(error)}`); state.endedAt = new Date().toISOString(); await this.store.saveState(state); return state; }
    if (snapshot.fingerprint !== state.fingerprint) throw new Error('Sources modifiées : créer un nouvel audit ; résultats précédents conservés');
    const checks = selectedChecks(plan, this.registry);
    if (checks.some(c => state.checkVersions[c.id] !== c.version)) throw new Error('Version de contrôle incompatible : créer un nouvel audit');
    const existing = await this.store.results(id), results = new Map<string, Result>();
    let previouslyStarted = new Set<string>(), journalUnavailable = false;
    if (resume) {
      try { previouslyStarted = await this.store.startedNodes(id); }
      catch (error) { journalUnavailable = true; state.limitations.push(String(error)); }
    }
    state.limitations = [...new Set([...state.limitations, ...existing.limitations])];
    state.status = 'running'; delete state.endedAt;
    for (const t of plan.targets) state.capabilities[t.id] = await capabilitiesFor(t, plan, targetSnapshot(snapshot, t.root));
    await this.store.saveState(state);
    await this.store.event(id, { type: resume ? 'run-resumed' : 'run-started', fingerprint: state.fingerprint });
    const key = (targetId: string, nodeId: string) => `${targetId}:${nodeId}`;
    if (resume) for (const r of existing.results) if (['completed', 'partial', 'not-applicable'].includes(r.executionStatus)) results.set(key(r.targetId, r.nodeId), r);
    const pending = plan.targets.flatMap(target => checks.map(check => ({ target, check }))).filter(job => !results.has(key(job.target.id, job.check.id)));
    const running = new Map<string, Promise<void>>(), held = new Set<string>();
    const persist = async (r: Result) => { await this.store.saveResult(r); results.set(key(r.targetId, r.nodeId), r); await this.store.event(id, { type: 'node-finished', targetId: r.targetId, nodeId: r.nodeId, status: r.executionStatus }); };
    while (pending.length || running.size) {
      let launched = false;
      for (let i = 0; i < pending.length && running.size < plan.concurrency;) {
        const job = pending[i]!, { target, check } = job, jobKey = key(target.id, check.id);
        if (!signal.aborted && check.requiredDependencies.some(dep => !results.has(key(target.id, dep)))) { i++; continue; }
        const resources = check.resourceRequirements.map(r => r === 'device' ? `device:${target.deviceId ?? target.id}` : r);
        const exclusive = resources.includes('exclusive');
        if (running.size && (held.has('exclusive') || exclusive || resources.some(r => held.has(r)))) { i++; continue; }
        pending.splice(i, 1); launched = true; resources.forEach(r => held.add(r));
        const eligibilityResult = eligibility(check, target, state.capabilities[target.id]!);
        const failedDep = check.requiredDependencies.find(dep => !['completed', 'partial'].includes(results.get(key(target.id, dep))?.executionStatus ?? ''));
        const previous = existing.results.find(r => r.targetId === target.id && r.nodeId === check.id);
        const task = (async () => {
          await this.store.event(id, { type: 'node-selected', targetId: target.id, nodeId: check.id });
          let r: Result;
          if (signal.aborted) r = emptyResult(id, check, target.id, 'cancelled', 'Annulation demandée');
          else if (eligibilityResult.status !== 'ready') r = emptyResult(id, check, target.id, eligibilityResult.status, eligibilityResult.reason!);
          else if (failedDep) r = emptyResult(id, check, target.id, 'skipped', `Dépendance obligatoire indisponible : ${failedDep}`);
          else if (resume && !check.retryPolicy.idempotent && (previous && ['error', 'timed-out', 'cancelled'].includes(previous.executionStatus) || previouslyStarted.has(jobKey) || journalUnavailable)) r = emptyResult(id, check, target.id, 'skipped', 'Reprise non automatique d’un contrôle pouvant modifier des données ; rétablir les préconditions puis créer un audit');
          else {
            const artifactDir = join(this.store.dir(id), 'evidence', target.id, check.id); await mkdir(artifactDir, { recursive: true });
            await this.store.event(id, { type: 'node-started', targetId: target.id, nodeId: check.id });
            r = await runNode(id, check, { plan, target, snapshot: targetSnapshot(snapshot, target.root), signal, artifactDir });
            for (const e of r.evidence) if (e.artifact) e.artifact = `${target.id}/${check.id}/${e.artifact}`;
          }
          if (resume && previous) { r.attempts = [...previous.attempts, ...r.attempts]; r.unstable ||= r.attempts.length > 1; }
          await persist(r);
        })().catch(async e => { state.limitations.push(`Échec de persistance ou d’infrastructure (${jobKey}) : ${String(e)}`); results.set(jobKey, emptyResult(id, check, target.id, 'error', String(e))); })
          .finally(() => { resources.forEach(r => held.delete(r)); running.delete(jobKey); });
        running.set(jobKey, task);
      }
      if (running.size) await Promise.race(running.values());
      else if (!launched && pending.length) throw new Error('Ordonnancement impossible');
    }
    state.status = signal.aborted ? 'cancelled' : [...results.values()].some(r => !['completed', 'not-applicable'].includes(r.executionStatus)) || state.limitations.length > 0 ? 'partial' : 'completed';
    state.endedAt = new Date().toISOString(); await this.store.saveState(state); await this.store.event(id, { type: 'run-finished', status: state.status }); return state;
  }
}
function emptyResult(runId: string, c: Check, targetId: string, executionStatus: Result['executionStatus'], reason?: string): Result {
  return { schemaVersion, runId, nodeId: c.id, nodeVersion: c.version, targetId, block: c.block, executionStatus, durationMs: 0, findings: [], measurements: [], evidence: [], limitations: reason ? [reason] : [], toolVersions: {}, attempts: [], unstable: false };
}
export async function runNode(runId: string, c: Check, ctx: Context): Promise<Result> {
  const result = emptyResult(runId, c, ctx.target.id, 'error'), totalStart = performance.now();
  for (let attempt = 0; attempt < c.retryPolicy.maxAttempts; attempt++) {
    const startedAt = new Date().toISOString(), start = performance.now(), controller = new AbortController();
    const abort = () => controller.abort(); ctx.signal.addEventListener('abort', abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined, onAbort: (() => void) | undefined, work: Promise<unknown> | undefined;
    try {
      if (ctx.signal.aborted) throw new Error('CANCELLED');
      c.inputSchema.parse(ctx.plan);
      work = c.run({ ...ctx, signal: controller.signal });
      const guard = new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error('CANCELLED'));
        ctx.signal.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, Math.min(c.timeoutMs, ctx.plan.timeoutMs));
      });
      const output = c.outputSchema.parse(await Promise.race([work, guard]));
      Object.assign(result, OutputSchema.parse(output));
      result.attempts.push({ startedAt, durationMs: performance.now() - start, status: result.executionStatus }); break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.executionStatus = ctx.signal.aborted || message === 'CANCELLED' ? 'cancelled' : message === 'TIMEOUT' ? 'timed-out' : 'error';
      result.error = message;
      result.attempts.push({ startedAt, durationMs: performance.now() - start, status: result.executionStatus, error: message });
      const retry = c.retryPolicy.idempotent && result.executionStatus === 'error' && c.retryPolicy.transientErrors.some(code => message.includes(code));
      if (!retry) break;
    } finally {
      clearTimeout(timer); ctx.signal.removeEventListener('abort', abort); if (onAbort) ctx.signal.removeEventListener('abort', onAbort);
      // Keep shared resources reserved until the isolated tool has closed its process.
      if (controller.signal.aborted && c.resourceRequirements.length && work) await Promise.race([work.catch(() => {}), new Promise(r => setTimeout(r, 2500))]);
    }
  }
  result.durationMs = performance.now() - totalStart; result.unstable = result.attempts.length > 1;
  if (['completed', 'partial'].includes(result.executionStatus)) delete result.error;
  return result;
}
