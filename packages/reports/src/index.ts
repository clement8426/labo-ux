import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { blocks, reportSections, type Result, type RunState } from '../../contracts/src/index.js';
import { Store } from '../../core/src/store.js';
import { renderHtml } from './html.js';
export type Report = { schemaVersion: '1'; state: RunState; results: Result[]; limitations: string[] };
export const blockNames = { 'design-system': 'Cohérence des composants', friction: 'Frictions et parcours', accessibility: 'Accessibilité', behavior: 'Données comportementales', microcopy: 'Microcopie', performance: 'Performances', technical: 'Diagnostics techniques complémentaires' };
export const findingNames: Record<string, string> = { 'button-name': 'Bouton sans nom accessible', 'image-alt': 'Images sans alternative textuelle', 'html-has-lang': 'Langue du document absente', 'color-contrast': 'Contrastes insuffisants', 'landmark-one-main': 'Repère principal absent', region: 'Contenu en dehors des repères' };
const modeText = (report: Report) => report.state.plan.mode === 'debug' ? 'Débogage — audit initial avant corrections. L’agent hôte doit lire les preuves, corriger puis lancer un nouvel audit.' : 'Audit — lecture et tests autorisés, sans réécriture du code. Le moteur écrit uniquement ses résultats et preuves.';
export function summarize(report: Report) {
  const priorities = new Map<string, { title: string; targetId: string; nodeId: string; severity: string; confidence: string; recommendation: string }>();
  for (const r of report.results) for (const f of r.findings) {
    const title = findingNames[f.id.split('.').at(-1)!] ?? (r.nodeId === 'friction.run-journey' ? `Parcours interrompu : ${f.id.replace(/-failure$/, '')}` : f.title);
    const key = `${r.targetId}:${title}`;
    if (!priorities.has(key)) priorities.set(key, { title, targetId: r.targetId, nodeId: r.nodeId, severity: f.severity, confidence: f.confidence, recommendation: f.recommendation });
  }
  const severity: Record<string, number> = { critical: 0, major: 1, minor: 2, info: 3 };
  return {
    mode: report.state.plan.mode ?? 'audit', modeText: modeText(report),
    failures: report.results.filter(r => ['error', 'timed-out', 'cancelled'].includes(r.executionStatus)).length,
    priorities: [...priorities.values()].sort((a, b) => (severity[a.severity]! - severity[b.severity]!) || Number(b.confidence === 'confirmed') - Number(a.confidence === 'confirmed')).slice(0, 6),
    blocks: blocks.map(block => {
      const selected = report.results.filter(r => r.block === block), executed = selected.filter(r => ['completed', 'partial'].includes(r.executionStatus));
      const details: string[] = [];
      for (const r of executed) {
        if (r.nodeId === 'design.collect-styles') details.push(`${r.findings.length} écart(s) de styles ou d’espacements à examiner ; ${r.measurements.find(m => m.name === 'design.compared-action-groups')?.value ?? 0} groupe(s) d’actions et ${r.measurements.find(m => m.name === 'design.compared-spacing-groups')?.value ?? 0} famille(s) d’espacements comparés. Vérifier l’intention et la couverture, même sans écart.`);
        if (r.nodeId === 'a11y.scan-screen') details.push(`${r.targetId} : ${r.findings.length} règle(s) axe en violation sur l’entrée.`);
        if (r.nodeId === 'a11y.scan-journey-states') details.push(`${r.evidence.filter(e => e.artifact?.endsWith('.axe.json')).length} état(s) de parcours analysé(s) en complément.`);
        if (r.nodeId === 'friction.run-journey') details.push(`${r.findings.length} interruption(s) de parcours déclarés ; cause à confirmer avec les captures et traces.`);
        if (r.nodeId === 'design.collect-tokens') { const m=r.measurements.find(m=>m.name==='source.distinct-color-literals');if(m)details.push(`${m.value} couleur(s) littérale(s) inventoriée(s). Leur nombre ne prouve pas une incohérence.`); }
        if (r.nodeId === 'copy.review-context') details.push(`${r.findings.length} signal(aux) de texte ambigu dans le code, à examiner dans leur contexte.`);
        if (r.nodeId === 'behavior.compute-funnel') { const steps=r.measurements.filter(m=>/^funnel\.\d+\./.test(m.name));const duplicates=r.measurements.find(m=>m.name==='data.duplicates');if(steps.length)details.push(`${r.targetId} : ${steps.map(m=>m.value).join(' → ')} sessions dans le tunnel importé ; ${duplicates?.value ?? 'nombre inconnu de'} doublon(s). Ces données ne prouvent pas les causes d’abandon.`); }
        if (r.nodeId === 'performance.inspect-resources') { const m=r.measurements.find(m=>m.name==='resources.observed-image-bytes');if(m)details.push(`${r.targetId} : ${(m.value/1_000_000).toLocaleString('fr-FR',{maximumFractionDigits:2})} Mo d’images observées ; ${r.findings.filter(f=>f.id.startsWith('uncached-image-')).length} image(s) avec no-store.`); }
        if (r.nodeId === 'performance.measure-web-load') { const m=r.measurements.find(m=>m.name==='largest-contentful-paint');if(m)details.push(`LCP Lighthouse ${m.context.formFactor ?? ''} : ${(m.value/1000).toLocaleString('fr-FR',{maximumFractionDigits:1})} s, mesure de laboratoire simulée ; ce n’est pas une mesure terrain.`); }
      }
      return { block, label: blockNames[block], checks: selected.length, executed: executed.length, findings: selected.reduce((n, r) => n + r.findings.length, 0), evidence: selected.reduce((n, r) => n + r.evidence.length, 0),
        message: !selected.length ? 'Non sélectionné.' : !executed.length ? 'Aucun contrôle exécuté ; consulter les prérequis.' : details.length ? details.join(' ') : `${executed.length} contrôle(s) exécuté(s), ${selected.reduce((n, r) => n + r.evidence.length, 0)} preuve(s). Les inventaires et hypothèses restent à interpréter.` };
    })
  };
}
export async function readReport(store: Store, id: string): Promise<Report> {
  const state = await store.state(id), { results, limitations } = await store.results(id);
  return { schemaVersion: '1', state, results, limitations: [...state.limitations, ...limitations] };
}
export function markdown(report: Report): string {
  const { state, results } = report;
  const lines = [`# Audit UX — ${state.id}`, '', `État : ${state.status}. Objectif : ${state.plan.objective}`, '',
    `Sources : ${state.fingerprint}. Début : ${state.startedAt}.`, '',
    modeText(report), '', 'Le moteur ne corrige pas le projet. Les corrections éventuelles relèvent de l’agent hôte en mode débogage autorisé.', '',
    'La couverture correspond aux contrôles enregistrés dans cette version du kit. Un contrôle terminé ne constitue pas une validation de tout le bloc.', '', '## Synthèse', ''];
  const summary = summarize(report);
  lines.push(`Erreurs d’outils : ${summary.failures}. Les défauts du produit sont distincts des pannes des outils.`, '', ...summary.blocks.map(b => `- ${b.label} : ${b.message}`), '', '### Points à examiner en priorité', '', ...summary.priorities.map(p => `- ${p.title} (${p.confidence === 'confirmed' ? 'constat étayé par un outil' : 'cause à confirmer'}) — ${p.targetId} / ${p.nodeId}.`), '', 'Ces priorités regroupent certains constats répétés entre états ; elles ne constituent pas un inventaire exhaustif de défauts distincts.', '', '## Couverture', '');
  for (const status of ['completed', 'partial', 'error', 'timed-out', 'skipped', 'not-applicable', 'cancelled']) lines.push(`- ${status} : ${results.filter(r => r.executionStatus === status).length}`);
  for (const t of state.plan.targets) {
    lines.push('', `## Cible ${t.id} (${t.kind})`, '');
    for (const block of reportSections) {
      lines.push(`### ${block}`, '');
      const selected = results.filter(r => r.targetId === t.id && r.block === block);
      if (!selected.length) lines.push('Aucun contrôle enregistré pour cette sélection.', '');
      for (const r of selected) {
        lines.push(`#### ${r.nodeId} — ${r.executionStatus}`, '');
        if (r.error) lines.push(`Erreur d’outil : ${r.error}`, '');
        for (const m of r.measurements) lines.push(`- Mesure ${m.name} : ${m.value} ${m.unit}. Contexte : ${JSON.stringify(m.context)}`);
        for (const f of r.findings) lines.push(`- [${f.severity} ; ${f.confidence}] ${f.title} : ${f.description} Recommandation : ${f.recommendation} Preuves : ${f.evidenceIds.join(', ')}`);
        for (const e of r.evidence) lines.push(`- Preuve ${e.id} (${e.kind}) : ${e.summary}${e.file ? ` — ${e.file}:${e.line ?? ''}` : ''}${e.artifact ? ` — evidence/${e.artifact}` : ''}`);
        for (const l of r.limitations) lines.push(`- Limite / restant : ${l}`);
        if (r.unstable) lines.push('- Résultat instable : plusieurs tentatives enregistrées.');
        lines.push('');
      }
    }
  }
  lines.push('## Limites de l’exécution', '', ...report.limitations.map(l => `- ${l}`), '');
  return lines.join('\n');
}
export function html(report: Report): string {
  return renderHtml(report, summarize(report));
}
export async function writeReports(store: Store, id: string): Promise<{ files: string[]; errors: string[] }> {
  const report = await readReport(store, id), files: string[] = [], errors: string[] = [];
  for (const [name, render] of [['report.json', () => JSON.stringify(report, null, 2)], ['report.md', () => markdown(report)], ['report.html', () => html(report)]] as const) {
    try { const path = join(store.dir(id), name); await writeFile(path, render(), 'utf8'); files.push(path); } catch (e) { errors.push(`${name} : ${String(e)}`); }
  }
  return { files, errors };
}
export function compareReports(before: Report, after: Report) {
  const beforeMap = new Map(before.results.map(r => [`${r.targetId}:${r.nodeId}`, r]));
  return after.results.map(r => {
    const old = beforeMap.get(`${r.targetId}:${r.nodeId}`), oldTarget = before.state.plan.targets.find(t => t.id === r.targetId), target = after.state.plan.targets.find(t => t.id === r.targetId);
    const comparable = !!old && old.executionStatus === 'completed' && r.executionStatus === 'completed' && old.nodeVersion === r.nodeVersion && JSON.stringify(oldTarget) === JSON.stringify(target) && JSON.stringify(before.state.versions) === JSON.stringify(after.state.versions) && JSON.stringify(old.toolVersions) === JSON.stringify(r.toolVersions);
    return { targetId: r.targetId, nodeId: r.nodeId, before: old?.executionStatus ?? 'absent', after: r.executionStatus, comparable,
      reason: comparable ? 'Environnement déclaré équivalent ; variations de laboratoire possibles' : 'Mesures non comparables : état, cible, profil, règle, contexte ou outils différents',
      measurements: r.measurements.map(m => { const prev = old?.measurements.find(p => p.name === m.name && p.unit === m.unit && JSON.stringify(p.context) === JSON.stringify(m.context)); return { name: m.name, unit: m.unit, before: prev?.value, after: m.value, delta: comparable && prev ? m.value - prev.value : null }; }),
      addedFindings: r.findings.filter(f => !old?.findings.some(o => o.id === f.id)).map(f => f.id),
      resolvedFindings: comparable ? old!.findings.filter(f => !r.findings.some(n => n.id === f.id)).map(f => f.id) : [] };
  });
}
export async function readSavedReport(path: string): Promise<Report> { return JSON.parse(await readFile(path, 'utf8')) as Report; }
