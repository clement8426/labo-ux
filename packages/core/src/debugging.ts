import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join, posix, win32 } from 'node:path';
import { z } from 'zod';
import type { Plan, RunState } from '../../contracts/src/index.js';
import { readReport, compareReports } from '../../reports/src/index.js';
import { Store } from './store.js';
const relativeFile = z.string().min(1).refine(path => !posix.isAbsolute(path) && !win32.isAbsolute(path) && !path.split(/[\\/]/).includes('..'), 'Chemin relatif au projet, sans remontée de dossier');
export const DebugChangesSchema = z.array(z.object({ file: relativeFile, summary: z.string().min(1) })).min(1);
function finished(state: RunState) {
  if (!['completed', 'partial'].includes(state.status) || !state.endedAt) throw new Error('Un audit terminé est obligatoire avant de préparer ou vérifier des corrections.');
}
function protocol(plan: Plan) {
  return JSON.stringify({ projectRoot: resolve(plan.projectRoot), source: plan.source, objective: plan.objective, usage: plan.usage, targets: plan.targets, blocks: plan.blocks, checks: plan.checks, journeys: plan.journeys, behavior: plan.behavior,
    permissions: { runtime: plan.permissions.runtime, dataMutation: plan.permissions.dataMutation } });
}
export async function debuggingPlan(store: Store, runId: string) {
  const report = await readReport(store, runId), { state, results } = report;
  finished(state);
  if (state.plan.mode !== 'debug' || !state.plan.permissions.codeModification) throw new Error('Cet audit est en lecture seule. Relancer un audit initial en mode debug avec autorisation de modifier le code.');
  if (!results.some(r => ['completed', 'partial'].includes(r.executionStatus) && r.evidence.length)) throw new Error('Aucune preuve exploitable : rétablir les outils avant de préparer une correction.');
  const brief = {
    baselineRunId: runId, mode: 'debug', phase: 'awaiting-agent-corrections', projectRoot: state.plan.projectRoot,
    baselineReport: join(store.dir(runId), 'report.html'),
    execution: 'Les corrections sont effectuées par l’agent hôte avec ses outils d’édition, jamais par le moteur Labo UX.',
    instructions: ['Lire les preuves avant de modifier le code. Confirmer les hypothèses dans le rendu et ne traiter que le périmètre autorisé.',
      'Conserver l’audit initial. Respecter les changements existants ; produire des modifications limitées et réversibles.',
      'Ne pas modifier les parcours, assertions, contrôles ou données de référence pour faire disparaître les défauts.',
      'Après les corrections, reconstruire/redémarrer si nécessaire, lancer les tests adaptés et créer un nouvel audit avec le même protocole.',
      'Appeler finish_debugging avec les deux identifiants et la liste réelle des fichiers modifiés. Un constat absent d’un contrôle non comparable n’est pas une correction prouvée.'],
    findings: results.flatMap(r => r.findings.map(f => ({ targetId: r.targetId, nodeId: r.nodeId, ...f, evidence: r.evidence.filter(e => f.evidenceIds.includes(e.id)) }))),
    limitations: [...report.limitations, ...results.flatMap(r => r.limitations)]
  };
  // A brief is an instruction handoff, never an edit operation or an assertion that
  // an external host has obeyed the code-write permission.
  await writeFile(join(store.dir(runId), 'debugging-plan.json'), JSON.stringify(brief, null, 2));
  return brief;
}
export async function finishDebugging(store: Store, beforeId: string, afterId: string, rawChanges: unknown) {
  if (beforeId === afterId) throw new Error('Un nouvel audit après correction est obligatoire.');
  const changes = DebugChangesSchema.parse(rawChanges);
  const before = await readReport(store, beforeId), after = await readReport(store, afterId);
  finished(before.state); finished(after.state);
  if (before.state.plan.mode !== 'debug' || !before.state.plan.permissions.codeModification) throw new Error('Le mode audit ne permet pas de déclarer une correction.');
  const brief = JSON.parse(await readFile(join(store.dir(beforeId), 'debugging-plan.json'), 'utf8'));
  if (brief.baselineRunId !== beforeId) throw new Error('Plan de correction incohérent.');
  if (Date.parse(after.state.startedAt) < Date.parse(before.state.endedAt!)) throw new Error('L’audit de vérification doit commencer après l’audit initial.');
  if (protocol(before.state.plan) !== protocol(after.state.plan)) throw new Error('Le protocole a changé : cibles, parcours, contrôles, données ou permissions de test différents. Les corrections ne peuvent pas être validées par ce workflow.');
  if (before.state.fingerprint === after.state.fingerprint) throw new Error('Les sources auditées sont identiques : aucune réécriture du projet n’est vérifiée. Utiliser compare_audits pour une simple comparaison sans correction.');
  const comparison = compareReports(before, after);
  const result = {
    before: beforeId, after: afterId, phase: 'verification-completed', codeChanges: 'déclarées par l’agent hôte, non appliquées par le moteur', changes,
    comparison, unresolvedFindings: after.results.flatMap(r => r.findings.map(f => ({ targetId: r.targetId, nodeId: r.nodeId, ...f }))),
    toolFailures: after.results.filter(r => ['error', 'timed-out', 'cancelled', 'skipped'].includes(r.executionStatus)).map(r => ({ nodeId: r.nodeId, targetId: r.targetId, status: r.executionStatus })),
    limitations: ['La liste des fichiers modifiés est déclarative ; elle n’est pas une preuve de causalité ni un diff certifié.', 'Seuls les contrôles comparables peuvent étayer la disparition d’un constat. Les autres cas demandent une vérification manuelle.', 'Une vérification terminée ne signifie pas que tout a été corrigé.']
  };
  await writeFile(join(store.dir(beforeId), 'debugging-result.json'), JSON.stringify(result, null, 2));
  const lines = ['# Débogage — compte rendu avant / après', '', `Audit initial : ${beforeId}. Audit après corrections : ${afterId}.`, '',
    'Les corrections sont réalisées par l’agent hôte. Ce compte rendu distingue les modifications déclarées et la vérification réelle.', '', '## Fichiers modifiés (déclaration de l’agent)', '', ...changes.map(c => `- ${c.file} : ${c.summary}`), '', '## Vérification', '',
    ...comparison.map(c => `- ${c.targetId} / ${c.nodeId} : ${c.comparable ? `${c.resolvedFindings.length} constat(s) disparu(s), ${c.addedFindings.length} nouveau(x)` : c.reason}`), '',
    `Constats encore présents (occurrences, états distincts possibles) : ${result.unresolvedFindings.length}. Contrôles empêchés ou en panne : ${result.toolFailures.length}.`, '', '## Limites', '', ...result.limitations.map(l => `- ${l}`), ''];
  await writeFile(join(store.dir(beforeId), 'debugging-result.md'), lines.join('\n'));
  return { ...result, summaryFile: join(store.dir(beforeId), 'debugging-result.md') };
}
