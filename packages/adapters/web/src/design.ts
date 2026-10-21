import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { OutputSchema, type Plan, type Finding, type Evidence } from '../../../contracts/src/index.js';

export type DesignElement = {
  selector: string; tag: string; text: string; font: string; color: string; background: string;
  padding: string; borderRadius: string; border: string; height: number; unit: string;
  family?: string; slot?: string; explicitGroup?: string;
};
export type DesignFamily = { id: string; members: Array<{ selector: string; spacing: Record<string, string> }> };
export type DesignSnapshot = {
  path: string; scopeId?: string; viewport: { width: number; height: number }; elements: DesignElement[];
  families: DesignFamily[]; truncated: boolean; explicitGroups: string[];
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16);
const actionProperties = ['font', 'color', 'background', 'padding', 'borderRadius', 'border'] as const;
// Comparer les styles, pas la hauteur issue d’un texte plus long ou d’un retour à la ligne.
export function differingProperties<T extends object, K extends keyof T>(values: T[], keys: readonly K[]): K[] {
  return keys.filter(key => new Set(values.map(value => JSON.stringify(value[key]))).size > 1);
}

export function analyzeDesign(snapshots: DesignSnapshot[]) {
  const findings: Finding[] = [], groups = new Map<string, Array<{ element: DesignElement; evidenceId: string }>>();
  let actionGroups = 0, spacingGroups = 0;
  snapshots.forEach((snapshot, index) => {
    const evidenceId = `design-${index}`, viewport = `${snapshot.viewport.width}x${snapshot.viewport.height}`;
    for (const element of snapshot.elements) {
      // Les groupes inter-pages doivent être déclarés : même libellé ne signifie pas même rôle.
      const scope = element.explicitGroup ? `declared:${element.explicitGroup}` : element.family && element.slot ? `${snapshot.scopeId ?? snapshot.path}:${element.family}:${element.slot}` : undefined;
      if (!scope) continue;
      const key = `${viewport}:${scope}`;
      groups.set(key, [...(groups.get(key) ?? []), { element, evidenceId }]);
    }
    for (const family of snapshot.families) {
      if (family.members.length < 2) continue;
      spacingGroups++;
      const keys = [...new Set(family.members.flatMap(member => Object.keys(member.spacing)))];
      // Un slot manquant n’est pas un espacement nul : ne comparer que les homologues présents.
      const commonKeys = keys.filter(key => family.members.every(member => Object.hasOwn(member.spacing, key)));
      const differences = differingProperties(family.members.map(member => member.spacing), commonKeys);
      if (!differences.length) continue;
      findings.push({ id: `spacing-${hash(`${snapshot.scopeId ?? snapshot.path}:${viewport}:${family.id}`)}`, title: 'Espacements différents entre composants répétés', severity: 'minor', confidence: 'hypothesis',
        description: `${snapshot.path}, ${viewport} CSS px : ${family.members.length} composants de structure comparable. Écarts observés : ${differences.map(key => `${key} = ${family.members.map(member => member.spacing[key]).join(' / ')}`).join('; ')}. Sélecteurs : ${family.members.map(member => member.selector).join(', ')}.`,
        recommendation: 'Vérifier l’intention graphique sur la capture. Si ces composants ont le même rôle, harmoniser leurs espacements avec une règle commune, puis retester aux mêmes largeurs. Ne pas confondre un texte de longueur différente avec un espacement CSS incohérent.', evidenceIds: [evidenceId, `${evidenceId}-screen`] });
    }
  });
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    actionGroups++;
    const differences = differingProperties(members.map(member => member.element), actionProperties);
    if (!differences.length) continue;
    findings.push({ id: `action-${hash(key)}`, title: 'Styles différents pour des actions homologues', severity: 'minor', confidence: 'hypothesis',
      description: `${key.split(':')[0]} CSS px : ${members.length} actions dans des composants répétés ou un groupe déclaré. Écarts : ${differences.map(property => `${property} = ${members.map(member => member.element[property]).join(' / ')}`).join('; ')}. Éléments : ${members.map(member => `${member.element.selector} (« ${member.element.text} »)`).join(', ')}.`,
      recommendation: 'Confirmer que les actions ont la même fonction et priorité. Si les différences ne sont pas intentionnelles, employer le même composant et ses tokens de style pour les boutons et liens concernés. Après correction, relancer ce contrôle avec le même périmètre ; ne pas uniformiser toutes les actions du site.', evidenceIds: [...new Set(members.flatMap(member => [member.evidenceId, `${member.evidenceId}-screen`]))] });
  }
  return { findings, actionGroups, spacingGroups };
}

export async function collectDesign(page: Page, groups: Array<{ id: string; selector: string }>): Promise<Omit<DesignSnapshot, 'path' | 'viewport'>> {
  return page.evaluate(declared => {
    const visible = (el: Element) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const selector = (el: Element): string => {
      const parts: string[] = [];
      let current: Element | null = el;
      while (current && current.tagName !== 'HTML') {
        const parent: Element | null = current.parentElement;
        const siblings: Element[] = parent ? [...parent.children].filter(sibling => sibling.tagName === current!.tagName) : [];
        parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`);
        current = parent;
      }
      return parts.join(' > ');
    };
    const actionSelector = 'button, a[href], [role="button"], input[type="submit"], input[type="button"]';
    const nodes = [...document.querySelectorAll(`${actionSelector}, h1, h2, h3, h4, h5, h6, input, select, textarea`)].filter(visible);
    const selected = nodes.slice(0, 500);
    const elements: DesignElement[] = selected.map(el => {
      const s = getComputedStyle(el);
      return { selector: selector(el), tag: el.tagName, text: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 120),
        font: s.font, color: s.color, background: s.backgroundColor, padding: s.padding, borderRadius: s.borderRadius,
        border: `${s.borderTop} | ${s.borderRight} | ${s.borderBottom} | ${s.borderLeft}`, height: Math.round(el.getBoundingClientRect().height * 100) / 100, unit: 'CSS px' };
    });
    const byNode = new Map(selected.map((node, index) => [node, elements[index]!]));
    const candidates = [...document.querySelectorAll('article, li, section, div, [role="listitem"]')].filter(el => visible(el) && el.querySelector('h2,h3,h4,h5,h6') && el.querySelector(actionSelector));
    const buckets = new Map<string, Element[]>();
    for (const el of candidates.slice(0, 300)) {
      if (!el.parentElement) continue;
      const shape = [...el.children].map(child => child.tagName).join(',');
      const key = `${selector(el.parentElement)}|${el.tagName}|${shape}`;
      buckets.set(key, [...(buckets.get(key) ?? []), el]);
    }
    const families: DesignFamily[] = [];
    for (const [id, members] of buckets) {
      if (members.length < 2) continue;
      families.push({ id, members: members.map(member => {
        const s = getComputedStyle(member), spacing: Record<string, string> = { padding: s.padding, rowGap: s.rowGap, columnGap: s.columnGap };
        // Les slots de structure comparable sont alignés par position DOM, jamais par titre métier.
        const children = [...member.querySelectorAll('h2,h3,h4,h5,h6,div,figure,p')].filter(visible).slice(0, 40);
        const counts = new Map<string, number>();
        for (const child of children) {
          const kind = child.tagName.toLowerCase(), count = counts.get(kind) ?? 0;
          counts.set(kind, count + 1);
          const style = getComputedStyle(child), prefix = `${kind}[${count}]`;
          spacing[`${prefix}.padding`] = style.padding;
          // Les marges utilisées des div peuvent varier avec le texte (flex + margin:auto).
          // Les titres gardent des marges éditoriales comparables ; le padding/gap reste inspecté partout.
          if (/^h[2-6]$/.test(kind)) spacing[`${prefix}.margin`] = style.margin;
          spacing[`${prefix}.gap`] = `${style.rowGap} ${style.columnGap}`;
        }
        [...member.querySelectorAll(actionSelector)].filter(visible).forEach((node, index) => {
          const element = byNode.get(node);
          if (element) { element.family = id; element.slot = `action[${index}]`; }
        });
        return { selector: selector(member), spacing };
      }) });
    }
    const explicitGroups: string[] = [];
    for (const group of declared) {
      // Une erreur de sélecteur fait échouer la collecte de cette page et reste visible dans les limites.
      const matches = [...document.querySelectorAll(group.selector)].filter(visible);
      for (const node of matches) {
        const element = byNode.get(node);
        if (element && node.matches(actionSelector)) { element.explicitGroup = group.id; explicitGroups.push(group.id); }
      }
    }
    return { elements, families, truncated: nodes.length > selected.length || candidates.length > 300, explicitGroups };
  }, groups);
}

export async function inspectDesign(page: Page, baseUrl: string, artifactDir: string, options: Plan['design']) {
  const config = options ?? { pages: [], groups: [], viewports: [{ width: 1280, height: 900 }, { width: 375, height: 812 }] };
  const base = new URL(baseUrl), urls = [...new Set([base.href, ...config.pages.map(path => {
    const url = new URL(path, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin) throw new Error('Page design hors de l’origine autorisée');
    return url.href;
  })])];
  const snapshots: DesignSnapshot[] = [], evidence: Evidence[] = [], limitations: string[] = [];
  for (const viewport of config.viewports) for (const url of urls) {
    const pathname = new URL(url).pathname;
    try {
      await page.setViewportSize(viewport);
      const response = await page.goto(url, { waitUntil: 'load', timeout: 20000 });
      if (!response?.ok() || new URL(page.url()).origin !== base.origin) throw new Error(`Réponse ${response?.status() ?? 'absente'} ou redirection hors origine`);
      await page.evaluate(() => document.fonts.ready);
      const snapshot = { ...await collectDesign(page, config.groups), path: new URL(page.url()).pathname, scopeId: hash(url), viewport };
      const index = snapshots.length;
      await writeFile(join(artifactDir, `design-${index}.json`), JSON.stringify(snapshot, null, 2));
      await page.screenshot({ path: join(artifactDir, `design-${index}.png`), fullPage: true });
      snapshots.push(snapshot);
      evidence.push({ id: `design-${index}`, kind: 'runtime-observation', summary: `${pathname}, ${viewport.width}×${viewport.height} CSS px : ${snapshot.elements.length} éléments et ${snapshot.families.length} familles répétées ; sélecteurs et styles calculés.`, artifact: `design-${index}.json` });
      evidence.push({ id: `design-${index}-screen`, kind: 'runtime-observation', summary: `Capture de ${pathname} au même viewport que les mesures`, artifact: `design-${index}.png` });
      if (snapshot.truncated) limitations.push(`${pathname}, ${viewport.width} px : collecte tronquée (500 éléments, 300 conteneurs maximum).`);
    } catch (error) { limitations.push(`${pathname}, ${viewport.width} px : comparaison non réalisée (${String(error)}).`); }
  }
  const analysis = analyzeDesign(snapshots);
  // Compatibilité avec les lecteurs d’inventaires 0.3 : tableau de styles de la première vue.
  await writeFile(join(artifactDir, 'styles.json'), JSON.stringify(snapshots[0]?.elements ?? [], null, 2));
  evidence.push({ id: 'styles', kind: 'runtime-observation', summary: 'Inventaire de la première vue, boutons et liens inclus ; comparaisons détaillées dans design-*.json.', artifact: 'styles.json' });
  for (const group of config.groups) for (const viewport of config.viewports) {
    const count = snapshots.filter(snapshot => snapshot.viewport.width === viewport.width && snapshot.viewport.height === viewport.height).reduce((total, snapshot) => total + snapshot.elements.filter(element => element.explicitGroup === group.id).length, 0);
    if (count < 2) limitations.push(`Groupe déclaré ${group.id}, ${viewport.width}×${viewport.height} : ${count} action(s) visible(s), au moins deux nécessaires pour comparer ; groupe non validé.`);
  }
  if (!analysis.actionGroups && !analysis.spacingGroups) limitations.push('Aucune famille comparable trouvée : cela ne valide pas la cohérence du produit. Déclarer des groupes homologues dans design.groups si nécessaire.');
  const incomplete = limitations.length > 0;
  limitations.push('Comparaisons des seules pages et largeurs enregistrées ; aucun parcours, état ouvert, survol ou focus rejoué dans ce contrôle. Les autres écrans doivent être déclarés dans design.pages. Les éléments hors écran sont inclus s’ils ont une boîte de rendu ; aucun chargement au défilement n’est déclenché.',
    'Les différences CSS sont observées ; leur caractère indésirable reste à confirmer selon l’intention graphique. Ne pas uniformiser des actions de fonctions ou priorités différentes. La structure répétée est une heuristique, pas une preuve d’équivalence métier.',
    'L’absence d’écart après refonte de la structure peut signifier qu’une famille n’est plus reconnue. Vérifier les sélecteurs et la couverture avant de conclure à une correction. Les hauteurs dues à des textes différents ne sont pas traitées comme un défaut à elles seules.');
  return OutputSchema.parse({ executionStatus: incomplete ? 'partial' : 'completed', findings: analysis.findings, evidence,
    measurements: [{ name: 'design.views', value: snapshots.length, unit: 'count' }, { name: 'design.compared-action-groups', value: analysis.actionGroups, unit: 'count' }, { name: 'design.compared-spacing-groups', value: analysis.spacingGroups, unit: 'count' }],
    limitations, toolVersions: { designCollector: '2.0.0', designScope: hash(JSON.stringify(config)) } });
}
