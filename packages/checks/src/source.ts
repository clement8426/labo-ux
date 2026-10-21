import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Context, Output } from '../../contracts/src/index.js';
import { define, output } from './helpers.js';
import { parseEvents, computeFunnel } from '../../adapters/behavior/src/index.js';

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;
function scan(ctx: Context, pattern: RegExp, title: string, recommendation: string): Output {
  const result = output({ executionStatus: 'partial', limitations: ['Analyse statique heuristique : présence dans le rendu et contexte à confirmer. Aucun audit automatique ne prouve une conformité complète.'] });
  for (const f of ctx.snapshot.files) {
    if (!/\.(html?|tsx?|jsx?|vue|svelte|astro|dart|swift|kt|xml|strings|arb)$/.test(f.path)) continue;
    for (const match of f.content.matchAll(pattern)) {
      const line = lineOf(f.content, match.index!), id = createHash('sha256').update(`${title}:${f.path}:${line}`).digest('hex').slice(0, 16);
      result.evidence.push({ id, kind: 'source-analysis', summary: match[0].slice(0, 240), file: f.path, line });
      result.findings.push({ id, severity: 'minor', title, description: `Motif repéré dans ${f.path}:${line}. Vérifier son usage à l’écran avant de conclure.`, recommendation, evidenceIds: [id], confidence: 'hypothesis' });
      if (result.findings.length >= 100) { result.limitations.push('Restitution limitée aux 100 premiers motifs.'); return result; }
    }
  }
  return result;
}
export const sourceChecks = [
  define('technical.inspect-cache-source', 'technical', async ctx => {
    const evidence = ctx.snapshot.files.filter(f => /\.(?:[cm]?[jt]sx?|json|conf|ya?ml|php|py|rb|go|java|kt|swift|dart)$/.test(f.path))
      .flatMap(f => [...f.content.matchAll(/(?:cache-control|\brevalidate\b|\bredis\b|force-cache|no-store|stale-while-revalidate|s-maxage)/gi)]
        .slice(0, 30).map(m => ({ id: `cache-${createHash('sha256').update(`${f.path}:${m.index}`).digest('hex').slice(0, 16)}`, kind: 'source-analysis' as const,
          summary: `Motif ${m[0]} repéré ; configuration et usage effectif à examiner.`, file: f.path, line: lineOf(f.content, m.index!) }))).slice(0, 150);
    return output({ executionStatus: 'partial', evidence, limitations: ['Inventaire heuristique du code disponible, sans exécution des accès au cache serveur. La présence de Redis ou d’une directive ne prouve ni son activation ni son efficacité. Aucun motif trouvé ne signifie pas absence de cache.'] });
  }),
  define('design.collect-tokens', 'design-system', async ctx => {
    const values = new Map<string, { file: string; line: number }[]>();
    for (const f of ctx.snapshot.files.filter(f => /\.(html?|css|scss|tsx?|jsx?|vue|svelte|dart|swift|kt)$/.test(f.path))) {
      for (const m of f.content.matchAll(/#[\da-fA-F]{3,8}\b/g)) { const v = m[0].toLowerCase(); values.set(v, [...(values.get(v) ?? []), { file: f.path, line: lineOf(f.content, m.index!) }]); }
    }
    return output({ executionStatus: 'partial', measurements: [{ name: 'source.distinct-color-literals', value: values.size, unit: 'count', context: { extraction: 'heuristic', units: 'color literal; no inferred CSS px/dp/pt' } }],
      evidence: [...values.entries()].slice(0, 200).map(([color, locations], i) => ({ id: `color-${i}`, kind: 'source-analysis' as const, summary: `${color} : ${locations.length} occurrence(s)`, ...locations[0]! })),
      limitations: ['Inventaire des couleurs littérales uniquement. Tokens résolus, états et cohérence entre écrans non vérifiés. Aucune incohérence déduite du seul nombre de couleurs.'] });
  }, { requiredCapabilities: ['source.styles'] }),
  define('a11y.check-labels', 'accessibility', async ctx => scan(ctx, /<img\b(?![^>]*\balt\s*=)[^>]*>/gi, 'Alternative d’image potentiellement absente', 'Vérifier le rôle de l’image et fournir une alternative adaptée ; alt="" pour une image décorative.')),
  define('copy.review-context', 'microcopy', async ctx => scan(ctx, /(?:>\s*(?:Cliquez ici|Click here|Erreur|Error|OK)\s*<)|(?:["'`](?:Une erreur est survenue|Something went wrong|Internal Server Error|undefined)["'`])/gi, 'Texte potentiellement vague ou technique', 'Vérifier le contexte, nommer l’action ou le problème et proposer une façon de poursuivre sans modifier les termes métier intentionnels.')),
  define('friction.validate-journey', 'friction', async ctx => {
    const journeys = ctx.plan.journeys.filter(j => j.targetId === ctx.target.id);
    return output({ executionStatus: 'partial', evidence: journeys.map(j => ({ id: j.id, kind: 'source-analysis' as const, summary: `${j.name} : ${j.steps.length} étapes ; objectif : ${j.expectedOutcome}` })),
      limitations: journeys.length ? ['Structure des parcours validée ; préconditions déclarées par le propriétaire, comportement et objectif final non confirmés à ce stade.'] : ['Aucun parcours défini : proposer un parcours adapté à l’objectif du produit, puis le faire confirmer.'] });
  }),
  define('behavior.suggest-instrumentation', 'behavior', async ctx => output({ executionStatus: 'partial', evidence: [{ id: 'measurement-plan', kind: 'source-analysis', summary: `Objectif déclaré : ${ctx.plan.objective}` }], limitations: [
    ctx.plan.behavior ? 'Import configuré ; qualité et tunnel traités séparément.' : 'Données absentes : aucun taux calculé. Définir des événements pour l’entrée, chaque action utile, les erreurs, la reprise et l’atteinte de l’objectif ; utiliser des identifiants fictifs de session/utilisateur.',
    'Une corrélation ou un abandon observé ne prouve pas sa cause UX.'
  ] })),
  define('behavior.compute-funnel', 'behavior', async ctx => {
    const config = ctx.plan.behavior!;
    const path = resolve(ctx.plan.projectRoot, config.file);
    if ((await stat(path)).size > 25_000_000) throw new Error('Import trop volumineux (maximum 25 Mo)');
    const raw = await readFile(path, 'utf8'), { events, duplicates } = parseEvents(raw, path.endsWith('.csv') ? 'csv' : 'json');
    const selected = events.filter(e => e.platform === ctx.target.kind || e.platform === 'unknown'), funnel = computeFunnel(selected, config.steps, config.windowMs);
    return output({ measurements: [
      ...funnel.counts.map((value, i) => ({ name: `funnel.${i + 1}.${config.steps[i]}`, value, unit: 'sessions', context: { windowMs: String(config.windowMs), target: ctx.target.kind } })),
      { name: 'data.duplicates', value: duplicates, unit: 'events', context: {} },
      { name: 'data.users', value: funnel.users, unit: 'users', context: {} },
      ...(funnel.conversion === null ? [] : [{ name: 'funnel.conversion', value: funnel.conversion, unit: 'ratio', context: { denominator: 'sessions ayant atteint la première étape' } }])
    ], evidence: [{ id: 'events', kind: 'measurement', summary: JSON.stringify({ ...funnel, duplicates, sha256: createHash('sha256').update(raw).digest('hex') }) }],
      limitations: ['Sessions partitionnées par utilisateur, session et plateforme ; étapes ordonnées, meilleure reprise dans la fenêtre. Plateforme unknown incluse : attribution à confirmer.',
        ...(funnel.conversion === null ? ['Aucune entrée dans le tunnel : taux indéfini, non remplacé par zéro.'] : []),
        ...(ctx.plan.source.mode === 'ssh' ? ['Le fichier d’événements est lu sur l’hôte local, relativement au projectRoot local.'] : [])] });
  }, { requiredCapabilities: ['behavior.events'] }),
  define('performance.check-environment', 'performance', async ctx => output({ executionStatus: 'partial', evidence: [{ id: 'build-profile', kind: 'source-analysis', summary: `Cible ${ctx.target.kind}, profil ${ctx.target.buildProfile}, métadonnées : ${JSON.stringify(ctx.target.platformMetadata)}` }],
    limitations: ['Aucune mesure native déduite du code. Comparer uniquement des environnements et profils équivalents ; documenter réseau, OS, appareil et version de l’application.'] }))
];
