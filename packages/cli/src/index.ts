#!/usr/bin/env node
import { Command } from 'commander';
import { writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PlanSchema, kitVersion, type Plan } from '../../contracts/src/index.js';
import { AuditEngine } from '../../core/src/index.js';
import { checks, prepare, loadPlan, confirmPlan, Store, readReport, compareReports, debuggingPlan, finishDebugging } from '../../core/src/service.js';
import { readFile } from 'node:fs/promises';
import { writeReports } from '../../reports/src/index.js';
import { readSnapshot } from '../../adapters/source/src/index.js';
import { discoverTargets, adapterCatalog, capabilitiesFor, snapshotForPlan } from '../../project-discovery/src/index.js';
import { targetSnapshot } from '../../adapters/source/src/index.js';
import { suggestions } from '../../profiles/src/index.js';
import { serveReport } from '../../reports/src/server.js';

const print = (v: unknown): void => { process.stdout.write(JSON.stringify(v, null, 2) + '\n'); };
const program = new Command().name('labo-ux').version(kitVersion).description('Kit modulaire d’audit UX, sans modèle IA obligatoire');
function configCommand(name: string, description: string) { return program.command(name).description(description).option('-c, --config <file>', 'Plan JSON', 'audit.json'); }
function filter(plan: Plan, options: any): Plan {
  const values = (v?: string) => v?.split(',').map(s => s.trim());
  const ids = values(options.target), blockIds = values(options.block), journeyIds = values(options.journey), checkIds = values(options.check);
  if (ids?.some(id => !plan.targets.some(t => t.id === id))) throw new Error('Cible sélectionnée inconnue');
  if (journeyIds?.some(id => !plan.journeys.some(j => j.id === id))) throw new Error('Parcours sélectionné inconnu');
  return PlanSchema.parse({ ...plan, mode: options.mode ?? plan.mode, permissions: { ...plan.permissions, codeModification: options.allowCodeChanges ?? (options.mode === 'audit' ? false : plan.permissions.codeModification) }, targets: plan.targets.filter(t => !ids || ids.includes(t.id)), blocks: blockIds ?? plan.blocks, checks: checkIds ?? plan.checks,
    journeys: plan.journeys.filter(j => (!ids || ids.includes(j.targetId)) && (!journeyIds || journeyIds.includes(j.id))) });
}
configCommand('doctor', 'Vérifier les capacités et les prérequis').action(async opts => {
  const plan = await loadPlan(opts.config), snapshot = await snapshotForPlan(plan);
  print({ node: process.version, adapters: adapterCatalog, targets: await Promise.all(plan.targets.map(async target => ({ target, capabilities: await capabilitiesFor(target, plan, targetSnapshot(snapshot, target.root)) }))) });
});
program.command('inspect [root]').description('Détecter les cibles dans un dossier accessible').action(async (root = '.') => { const snapshot = await readSnapshot(resolve(root)); print({ targets: discoverTargets(snapshot), fingerprint: snapshot.fingerprint, limitations: snapshot.limitations }); });
configCommand('init', 'Créer un plan non confirmé').option('--root <path>', 'Racine du projet', '.').option('--usage <type>', 'Usage du produit', 'custom').action(async opts => {
  try { await access(opts.config); throw new Error('Le fichier de configuration existe déjà'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const root = resolve(opts.root), snapshot = await readSnapshot(root), plan = PlanSchema.parse({ projectRoot: root, usage: opts.usage, targets: discoverTargets(snapshot) });
  await writeFile(opts.config, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' }); print({ config: resolve(opts.config), confirmed: false, suggestions: suggestions[plan.usage] });
});
configCommand('plan', 'Afficher la couverture prévue').option('--confirm', 'Enregistrer la confirmation de ce plan').action(async opts => {
  const plan = opts.confirm ? await confirmPlan(opts.config) : await loadPlan(opts.config), info = await prepare(plan, checks);
  print({ mode: plan.mode, codeModification: plan.permissions.codeModification, confirmed: plan.confirmed, coverage: info.coverage, suggestions: suggestions[plan.usage], limitations: info.snapshot.limitations });
});
const run = configCommand('run', 'Auditer ; en mode debug, produire l’audit initial avant toute correction par l’agent').option('--mode <mode>', 'audit (sans réécriture) ou debug (audit puis corrections par l’agent)').option('--allow-code-changes', 'Autoriser explicitement les corrections par l’agent en mode debug').option('--target <ids>', 'Cibles, séparées par virgules').option('--block <ids>', 'Blocs').option('--journey <ids>', 'Parcours').option('--check <ids>', 'Vérifications');
run.action(async opts => {
  const plan = filter(await loadPlan(opts.config), opts), engine = new AuditEngine(checks, plan.outputDir), controller = new AbortController();
  const cancel = () => controller.abort(); process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    const state = await engine.create(plan); process.stderr.write(`Audit ${state.id} — mode ${plan.mode}\n`);
    const done = await engine.execute(state.id, controller.signal), reports = await writeReports(engine.store, state.id);
    let workflow: unknown = { mode: plan.mode, codeModifiedByEngine: false, phase: plan.mode === 'debug' ? 'initial-audit-incomplete' : 'audit-only' };
    if (plan.mode === 'debug' && ['completed', 'partial'].includes(done.status)) {
      try { workflow = await debuggingPlan(engine.store, state.id); }
      catch (error) { workflow = { mode: 'debug', phase: 'blocked-before-corrections', codeModifiedByEngine: false, reason: error instanceof Error ? error.message : String(error) }; }
    }
    print({ state: done, reports, workflow }); if (done.status === 'cancelled') process.exitCode = 130;
  }
  finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
});
function savedCommand(name: string, description: string) { return program.command(`${name} <runId>`).description(description).option('--output <path>', 'Dossier des audits', '.labo-ux'); }
savedCommand('status', 'Lire l’état et les résultats déjà enregistrés').action(async (id, opts) => { print(await readReport(new Store(opts.output), id)); });
savedCommand('resume', 'Reprendre après vérification des versions et sources').action(async (id, opts) => {
  const store = new Store(opts.output), state = await store.state(id), engine = new AuditEngine(checks, opts.output), controller = new AbortController();
  const cancel = () => controller.abort(); process.once('SIGINT', cancel);
  try { if (resolve(state.plan.outputDir) !== resolve(opts.output)) throw new Error('Le dossier des résultats a été déplacé ; créer un nouvel audit'); print({ state: await engine.execute(id, controller.signal, true), reports: await writeReports(store, id) }); }
  finally { process.removeListener('SIGINT', cancel); }
});
savedCommand('report', 'Régénérer les rapports depuis les résultats enregistrés').action(async (id, opts) => print(await writeReports(new Store(opts.output), id)));
savedCommand('serve-report', 'Afficher un rapport local dans le navigateur, sans nouvelle analyse').option('--port <port>', 'Port local', '4193').action(async(id,opts)=>{
  const port=Number(opts.port);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Port invalide');
  const store=new Store(opts.output);await store.state(id);const reports=await writeReports(store,id);if(reports.errors.length)throw new Error(reports.errors.join('; '));
  const server=await serveReport(store.dir(id),port);print({url:`http://127.0.0.1:${port}`,runId:id,mode:'read-only-report'});
  const stop=()=>server.close(()=>process.exit(0));process.once('SIGINT',stop);process.once('SIGTERM',stop);
});
savedCommand('debug-plan', 'Lire le plan de correction après un audit initial en mode debug').action(async (id, opts) => print(await debuggingPlan(new Store(opts.output), id)));
program.command('debug-finish <before> <after>').description('Vérifier les corrections déclarées après un nouvel audit').requiredOption('--changes <file>', 'JSON des fichiers modifiés : [{file, summary}]').option('--output <path>', 'Dossier des audits', '.labo-ux').action(async (before, after, opts) => print(await finishDebugging(new Store(opts.output), before, after, JSON.parse(await readFile(opts.changes, 'utf8')))));
program.command('compare <before> <after>').description('Comparer deux audits sans agréger les plateformes').option('--output <path>', 'Dossier des audits', '.labo-ux').action(async (before, after, opts) => { const store = new Store(opts.output); print(compareReports(await readReport(store, before), await readReport(store, after))); });
program.command('checks').command('list').action(() => print(checks.map(({ run: _run, inputSchema: _in, outputSchema: _out, ...declaration }) => declaration)));
program.command('adapters').command('list').action(() => print(adapterCatalog));
program.parseAsync().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
