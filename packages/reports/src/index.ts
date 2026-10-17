import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { blocks, type Result, type RunState } from '../../contracts/src/index.js';
import { Store } from '../../core/src/store.js';
export type Report = { schemaVersion: '1'; state: RunState; results: Result[]; limitations: string[] };
const escape = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export async function readReport(store: Store, id: string): Promise<Report> {
  const state = await store.state(id), { results, limitations } = await store.results(id);
  return { schemaVersion: '1', state, results, limitations: [...state.limitations, ...limitations] };
}
export function markdown(report: Report): string {
  const { state, results } = report;
  const lines = [`# Audit UX — ${state.id}`, '', `État : ${state.status}. Objectif : ${state.plan.objective}`, '',
    `Sources : ${state.fingerprint}. Début : ${state.startedAt}.`, '',
    'La couverture correspond aux contrôles enregistrés dans cette version du kit. Un contrôle terminé ne constitue pas une validation de tout le bloc.', '', '## Couverture', ''];
  for (const status of ['completed', 'partial', 'error', 'timed-out', 'skipped', 'not-applicable', 'cancelled']) lines.push(`- ${status} : ${results.filter(r => r.executionStatus === status).length}`);
  for (const t of state.plan.targets) {
    lines.push('', `## Cible ${t.id} (${t.kind})`, '');
    for (const block of blocks) {
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
  const { state, results } = report;
  const statusCounts = Object.fromEntries(['completed', 'partial', 'skipped', 'not-applicable', 'error', 'timed-out', 'cancelled'].map(s => [s, results.filter(r => r.executionStatus === s).length]));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'"><title>Audit UX ${escape(state.id)}</title>
<style>:root{font:16px/1.6 system-ui;color:#172b36;background:#f3f6f5}body{max-width:1120px;margin:auto;padding:36px 24px}h1{font-size:2.6rem;line-height:1.1}h2{margin-top:2rem}a{color:#005b70}header{border-bottom:3px solid #007e80;padding-bottom:24px}.cards{display:flex;gap:12px;flex-wrap:wrap}.card,article{background:white;border:1px solid #cedcda;border-radius:12px;padding:18px;margin:12px 0}.card strong{display:block;font-size:2rem}.tag{border:1px solid #cedcda;border-radius:4px;padding:2px 8px}summary{cursor:pointer;font-weight:600}.error{color:#8b2424}pre{white-space:pre-wrap;overflow-wrap:anywhere}li{margin:8px 0}.muted{color:#4e626b}article{border-left:4px solid #007e80}nav{display:flex;gap:16px;flex-wrap:wrap}img{max-width:100%}</style>
<header><p>LABO UX · RAPPORT LOCAL · v0.1</p><h1>Ce qui a été vérifié.<br>Ce qui reste à explorer.</h1><p>${escape(state.plan.objective)}</p><p><span class="tag">${escape(state.status)}</span> · ${escape(state.startedAt)} · ${state.plan.targets.length} cible(s)</p></header>
<p class="muted">Chaque contrôle a son périmètre. Les blocs ne sont pas résumés par un score universel. Les constats du produit, les erreurs d’outils et les limites sont séparés.</p>
<div class="cards">${Object.entries(statusCounts).map(([s, n]) => `<div class="card"><strong>${n}</strong>${s}</div>`).join('')}</div>
<nav aria-label="Cibles">${state.plan.targets.map(t => `<a href="#${escape(t.id)}">${escape(t.id)} · ${t.kind}</a>`).join('')}</nav>
${state.plan.targets.map(t => `<section id="${escape(t.id)}"><h2>${escape(t.id)} · ${t.kind}</h2>${blocks.map(b => `<h3>${b}</h3>${results.filter(r => r.targetId === t.id && r.block === b).map(r => `<article><h4>${escape(r.nodeId)} <span class="tag">${r.executionStatus}</span></h4><p class="muted">${Math.round(r.durationMs)} ms · règle ${escape(r.nodeVersion)} · ${r.attempts.length} tentative(s)${r.unstable ? ' · instable' : ''}</p>
${r.findings.length ? `<h5>Constats sur le produit</h5><ul>${r.findings.map(f => `<li><strong>${escape(f.title)}</strong> [${f.severity} ; ${f.confidence}]<p>${escape(f.description)}</p><p>${escape(f.recommendation)}</p><small>Preuves : ${escape(f.evidenceIds.join(', '))}</small></li>`).join('')}</ul>` : ''}
${r.error ? `<p class="error"><strong>Erreur d’outil :</strong> ${escape(r.error)}</p>` : ''}
${r.measurements.length ? `<h5>Mesures</h5><ul>${r.measurements.map(m => `<li>${escape(m.name)} : <strong>${m.value} ${escape(m.unit)}</strong><small> · ${escape(JSON.stringify(m.context))}</small></li>`).join('')}</ul>` : ''}
<details><summary>Preuves (${r.evidence.length})</summary><ul>${r.evidence.map(e => `<li><span class="tag">${e.kind}</span> ${escape(e.id)} : ${escape(e.summary)}${e.file ? `<p>${escape(e.file)}:${e.line ?? ''}</p>` : ''}${e.artifact ? `<p><a href="evidence/${escape(e.artifact.split('/').map(encodeURIComponent).join('/'))}">Ouvrir la preuve</a></p>` : ''}</li>`).join('')}</ul></details>
${r.limitations.length ? `<h5>Limites et contrôles restants</h5><ul>${r.limitations.map(l => `<li>${escape(l)}</li>`).join('')}</ul>` : ''}</article>`).join('') || '<p>Aucun résultat dans cette sélection.</p>'}`).join('')}</section>`).join('')}
<h2>Limites de l’exécution</h2><ul>${report.limitations.map(l => `<li>${escape(l)}</li>`).join('')}</ul><details><summary>Environnement et version du code</summary><pre>${escape(JSON.stringify({ fingerprint: state.fingerprint, versions: state.versions, capabilities: state.capabilities }, null, 2))}</pre></details></html>`;
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
