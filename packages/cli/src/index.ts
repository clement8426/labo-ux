#!/usr/bin/env node
import { Command } from 'commander';
import { writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PlanSchema, type Plan } from '../../contracts/src/index.js';
import { AuditEngine } from '../../core/src/index.js';
import { checks, prepare, loadPlan, confirmPlan, Store, readReport, compareReports } from '../../core/src/service.js';
import { writeReports } from '../../reports/src/index.js';
import { readSnapshot } from '../../adapters/source/src/index.js';
import { discoverTargets, adapterCatalog, capabilitiesFor, snapshotForPlan } from '../../project-discovery/src/index.js';
import { targetSnapshot } from '../../adapters/source/src/index.js';
import { suggestions } from '../../profiles/src/index.js';

const print = (v: unknown): void => { process.stdout.write(JSON.stringify(v, null, 2) + '\n'); };
const program = new Command().name('labo-ux').version('0.1.0').description('Kit modulaire d’audit UX, sans modèle IA obligatoire');
function configCommand(name: string, description: string) { return program.command(name).description(description).option('-c, --config <file>', 'Plan JSON', 'audit.json'); }
function filter(plan: Plan, options: any): Plan {
  const values = (v?: string) => v?.split(',').map(s => s.trim());
  const ids = values(options.target), blockIds = values(options.block), journeyIds = values(options.journey), checkIds = values(options.check);
  if (ids?.some(id => !plan.targets.some(t => t.id === id))) throw new Error('Cible sélectionnée inconnue');
  if (journeyIds?.some(id => !plan.journeys.some(j => j.id === id))) throw new Error('Parcours sélectionné inconnu');
  return PlanSchema.parse({ ...plan, targets: plan.targets.filter(t => !ids || ids.includes(t.id)), blocks: blockIds ?? plan.blocks, checks: checkIds ?? plan.checks,
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
  print({ confirmed: plan.confirmed, coverage: info.coverage, suggestions: suggestions[plan.usage], limitations: info.snapshot.limitations });
});
const run = configCommand('run', 'Exécuter les contrôles sélectionnés').option('--target <ids>', 'Cibles, séparées par virgules').option('--block <ids>', 'Blocs').option('--journey <ids>', 'Parcours').option('--check <ids>', 'Vérifications');
run.action(async opts => {
  const plan = filter(await loadPlan(opts.config), opts), engine = new AuditEngine(checks, plan.outputDir), controller = new AbortController();
  const cancel = () => controller.abort(); process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try { const state = await engine.create(plan); process.stderr.write(`Audit ${state.id}\n`); const done = await engine.execute(state.id, controller.signal); print({ state: done, reports: await writeReports(engine.store, state.id) }); if (done.status === 'cancelled') process.exitCode = 130; }
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
program.command('compare <before> <after>').description('Comparer deux audits sans agréger les plateformes').option('--output <path>', 'Dossier des audits', '.labo-ux').action(async (before, after, opts) => { const store = new Store(opts.output); print(compareReports(await readReport(store, before), await readReport(store, after))); });
program.command('checks').command('list').action(() => print(checks.map(({ run: _run, inputSchema: _in, outputSchema: _out, ...declaration }) => declaration)));
program.command('adapters').command('list').action(() => print(adapterCatalog));
program.parseAsync().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
