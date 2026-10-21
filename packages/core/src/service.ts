import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PlanSchema, type Plan } from '../../contracts/src/index.js';
import { checks } from '../../checks/src/index.js';
import { AuditEngine, prepare } from './index.js';
import { Store } from './store.js';
import { writeReports, readReport, compareReports } from '../../reports/src/index.js';
export { checks, prepare, Store, readReport, compareReports };
export { debuggingPlan, finishDebugging, DebugChangesSchema } from './debugging.js';
export function normalizePlan(raw: unknown, base: string): Plan {
  const plan = PlanSchema.parse(raw);
  plan.projectRoot = resolve(base, plan.projectRoot); plan.outputDir = resolve(base, plan.outputDir);
  return plan;
}
export async function loadPlan(path: string): Promise<Plan> { return normalizePlan(JSON.parse(await readFile(path, 'utf8')), dirname(resolve(path))); }
export async function confirmPlan(path: string): Promise<Plan> {
  const plan = await loadPlan(path); await prepare(plan, checks);
  const raw = JSON.parse(await readFile(path, 'utf8')); raw.confirmed = true;
  await writeFile(path, JSON.stringify(raw, null, 2) + '\n'); return loadPlan(path);
}
export class AuditService {
  private jobs = new Map<string, { controller: AbortController; done: Promise<unknown> }>();
  async start(plan: Plan) {
    const engine = new AuditEngine(checks, plan.outputDir), state = await engine.create(plan), controller = new AbortController();
    const done = engine.execute(state.id, controller.signal).catch(async error => {
      const saved = await engine.store.state(state.id); saved.status = 'interrupted'; saved.limitations.push(String(error)); await engine.store.saveState(saved);
    }).then(() => writeReports(engine.store, state.id)).finally(() => this.jobs.delete(state.id));
    this.jobs.set(state.id, { controller, done }); return { runId: state.id, outputDir: plan.outputDir, status: 'running', mode: plan.mode, phase: plan.mode === 'debug' ? 'initial-audit' : 'audit-only', codeModifiedByEngine: false };
  }
  async cancel(id: string) { const job = this.jobs.get(id); if (!job) throw new Error('Audit non actif dans ce processus MCP'); job.controller.abort(); return { runId: id, cancellationRequested: true }; }
  async shutdown() { for (const job of this.jobs.values()) job.controller.abort(); await Promise.allSettled([...this.jobs.values()].map(j => j.done)); }
}
