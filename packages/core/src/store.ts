import { mkdir, rename, readFile, readdir, open, unlink, realpath, appendFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ResultSchema, PlanSchema, type Result, type RunState } from '../../contracts/src/index.js';

export async function atomicJson(path: string, data: unknown): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  const file = await open(temp, 'wx');
  try { await file.writeFile(JSON.stringify(data, null, 2)); await file.sync(); } finally { await file.close(); }
  await rename(temp, path);
}
export class Store {
  constructor(readonly root: string) {}
  dir(id: string): string { if (!/^[\w.-]+$/.test(id)) throw new Error('Identifiant de run invalide'); return join(resolve(this.root), id); }
  async initialize(state: RunState): Promise<void> { await mkdir(join(this.dir(state.id), 'results'), { recursive: true }); await mkdir(join(this.dir(state.id), 'evidence'), { recursive: true }); await this.saveState(state); }
  async saveState(state: RunState): Promise<void> { await atomicJson(join(this.dir(state.id), 'run.json'), state); }
  async event(id: string, data: Record<string, unknown>): Promise<void> { await appendFile(join(this.dir(id), 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...data }) + '\n'); }
  async startedNodes(id: string): Promise<Set<string>> {
    let raw: string;
    try { raw = await readFile(join(this.dir(id), 'events.jsonl'), 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return new Set(); throw e; }
    const started = new Set<string>();
    for (const line of raw.split('\n').filter(Boolean)) {
      try { const event = JSON.parse(line); if (event.type === 'node-started' && typeof event.targetId === 'string' && typeof event.nodeId === 'string') started.add(`${event.targetId}:${event.nodeId}`); }
      catch { throw new Error('Journal interrompu ou corrompu : les parcours mutateurs ne peuvent pas être repris automatiquement'); }
    }
    return started;
  }
  async state(id: string): Promise<RunState> {
    const state = JSON.parse(await readFile(join(this.dir(id), 'run.json'), 'utf8')) as RunState;
    if (state.schemaVersion !== '1' || state.id !== id) throw new Error('Version ou identifiant de run incompatible');
    state.plan = PlanSchema.parse(state.plan);
    if (state.status === 'running') {
      let active = false;
      try { const pid = Number(await readFile(join(this.dir(id), 'run.lock'), 'utf8')); if (Number.isInteger(pid) && pid > 0) { process.kill(pid, 0); active = true; } }
      catch (e) { if ((e as NodeJS.ErrnoException).code === 'EPERM') active = true; else if (!['ENOENT', 'ESRCH'].includes((e as NodeJS.ErrnoException).code ?? '')) throw e; }
      if (!active) { state.status = 'interrupted'; state.limitations = [...state.limitations, 'Aucun processus actif associé à cet audit ; utiliser resume pour reprendre.']; }
    }
    return state;
  }
  async saveResult(result: Result): Promise<void> { await atomicJson(join(this.dir(result.runId), 'results', `${result.targetId}--${result.nodeId}.json`), ResultSchema.parse(result)); }
  async results(id: string): Promise<{ results: Result[]; limitations: string[] }> {
    const results: Result[] = [], limitations: string[] = [];
    for (const name of (await readdir(join(this.dir(id), 'results'))).filter(n => n.endsWith('.json'))) {
      try { const r = ResultSchema.parse(JSON.parse(await readFile(join(this.dir(id), 'results', name), 'utf8'))); if (r.runId !== id) throw new Error('Run incohérent'); results.push(r); }
      catch { limitations.push(`Résultat corrompu ignoré : ${name}`); }
    }
    return { results, limitations };
  }
  async lock(id: string): Promise<() => Promise<void>> {
    const path = join(this.dir(id), 'run.lock');
    try { const file = await open(path, 'wx'); await file.writeFile(String(process.pid)); await file.close(); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const pid = Number(await readFile(path, 'utf8'));
      try { process.kill(pid, 0); } catch (err) { if ((err as NodeJS.ErrnoException).code === 'ESRCH') { await unlink(path); return this.lock(id); } throw err; }
      throw new Error('Audit déjà actif ; attendre sa fin avant de reprendre');
    }
    return async () => { await unlink(path); };
  }
  async evidence(id: string, artifact: string): Promise<Buffer> {
    const base = await realpath(join(this.dir(id), 'evidence')), path = await realpath(resolve(base, artifact)), rel = relative(base, path);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Preuve hors du dossier autorisé');
    return readFile(path);
  }
}
