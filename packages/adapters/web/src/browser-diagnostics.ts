import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserContext, Page } from 'playwright-core';
import { OutputSchema, type Output, type Finding } from '../../../contracts/src/index.js';

export function publicUrl(value: string): string {
  try { const url = new URL(value); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.href; }
  catch { return '[adresse non interprétable]'; }
}
const safeMessage = (value: string) => value.replace(/https?:\/\/[^\s"'<>]+/g, publicUrl)
  .replace(/\b(token|password|secret|authorization|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[masqué]').slice(0, 1000);
type RequestRecord = { phase: string; url: string; method: string; type?: string; status?: number; cacheControl?: string; protocol?: string; fromDiskCache?: boolean; fromServiceWorker?: boolean; servedFromCache?: boolean; encodedDataLength?: number; durationMs?: number; failure?: string; start: number };

export async function browserDiagnostics(task: string, context: BrowserContext, page: Page, url: string, artifactDir: string, toolVersions: Record<string, string>): Promise<Output> {
  const session = await context.newCDPSession(page);
  const evidence = [], measurements = [], findings: Finding[] = [], limitations: string[] = [];
  if (task === 'network') {
    const records = new Map<string, RequestRecord>(); let phase = 'cold';
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled', { cacheDisabled: false });
    session.on('Network.requestWillBeSent', e => {
      const key = `${phase}:${e.requestId}`;
      if (records.size < 2000) records.set(key, { phase, url: publicUrl(e.request.url), method: e.request.method, type: e.type, start: e.timestamp });
    });
    session.on('Network.requestServedFromCache', e => { const r = records.get(`${phase}:${e.requestId}`); if (r) r.servedFromCache = true; });
    session.on('Network.responseReceived', e => {
      const r = records.get(`${phase}:${e.requestId}`); if (!r) return;
      const headers = Object.fromEntries(Object.entries(e.response.headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
      Object.assign(r, { status: e.response.status, cacheControl: headers['cache-control'] ?? '', protocol: e.response.protocol, fromDiskCache: e.response.fromDiskCache ?? false, fromServiceWorker: e.response.fromServiceWorker ?? false });
    });
    session.on('Network.loadingFinished', e => { const r = records.get(`${phase}:${e.requestId}`); if (r) Object.assign(r, { encodedDataLength: e.encodedDataLength, durationMs: (e.timestamp - r.start) * 1000 }); });
    session.on('Network.loadingFailed', e => { const r = records.get(`${phase}:${e.requestId}`); if (r) r.failure = safeMessage(e.errorText); });
    await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(250);
    phase = 'warm'; await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(250);
    const requests = [...records.values()].map(({ start: _start, ...r }) => r);
    await writeFile(join(artifactDir, 'network.json'), JSON.stringify({ url: publicUrl(url), requests, redaction: 'Pas de corps, cookies, en-têtes d’authentification, query strings ou fragments.' }, null, 2));
    for (const name of ['cold', 'warm']) {
      const selected = requests.filter(r => r.phase === name);
      measurements.push({ name: `network.${name}.requests`, value: selected.length, unit: 'count', context: { phase: name } },
        { name: `network.${name}.transferred-bytes`, value: selected.reduce((sum, r) => sum + (r.encodedDataLength ?? 0), 0), unit: 'bytes', context: { source: 'CDP Network.loadingFinished ; transfert signalé par Chrome, réponses terminées seulement' } },
        { name: `network.${name}.cache-hits`, value: selected.filter(r => r.servedFromCache || r.fromDiskCache || r.fromServiceWorker).length, unit: 'count', context: { source: 'Signaux de cache Chrome ; 304 comptés séparément' } },
        { name: `network.${name}.revalidated`, value: selected.filter(r => r.status === 304).length, unit: 'count', context: {} });
    }
    const failed = requests.filter(r => r.failure || (r.status ?? 0) >= 400);
    if (failed.length) findings.push({ id: 'network-errors', title: 'Requêtes en échec au chargement', description: `${failed.length} requête(s) en échec observée(s) sur les deux chargements. Consulter les URLs et statuts dans la preuve.`, severity: 'minor', confidence: 'confirmed', recommendation: 'Vérifier le rôle de ces ressources et les erreurs côté serveur avant de conclure à leur conséquence utilisateur.', evidenceIds: ['network'] });
    evidence.push({ id: 'network', kind: 'measurement', summary: 'Deux chargements : contexte navigateur neuf, puis rechargement dans le même contexte. Réseau, statuts et signaux de cache.', artifact: 'network.json' });
    limitations.push('Page d’entrée uniquement, sans parcours ni HAR complet. Les requêtes encore actives au point de collecte peuvent avoir une durée ou une taille inconnue. Maximum 2 000 entrées ; redirections partageant un identifiant CDP non détaillées.', 'Un cache navigateur observé ne prouve pas un cache Redis/CDN. Aucun gain utilisateur déduit de deux chargements. Cache et service worker peuvent influencer le second chargement.');
  } else if (task === 'memory') {
    await session.send('Performance.enable');
    await page.goto(url, { waitUntil: 'load' });
    const samples = [];
    for (let i = 0; i < 2; i++) {
      if (i) await page.waitForTimeout(500);
      const { metrics } = await session.send('Performance.getMetrics'), dom = await session.send('Memory.getDOMCounters');
      const values = Object.fromEntries(metrics.map(m => [m.name, m.value]));
      samples.push({ at: new Date().toISOString(), jsHeapUsedSize: values.JSHeapUsedSize ?? null, jsHeapTotalSize: values.JSHeapTotalSize ?? null, ...dom });
    }
    await writeFile(join(artifactDir, 'memory.json'), JSON.stringify({ url: publicUrl(url), samples }, null, 2));
    const last = samples.at(-1)!;
    if (last.jsHeapUsedSize !== null) measurements.push({ name: 'memory.js-heap-used', value: last.jsHeapUsedSize, unit: 'bytes', context: { scope: 'Tas JavaScript du renderer, après chargement ; pas la RAM totale du navigateur' } });
    for (const key of ['documents', 'nodes', 'jsEventListeners'] as const) measurements.push({ name: `memory.${key}`, value: last[key], unit: 'count', context: { source: 'CDP Memory.getDOMCounters' } });
    evidence.push({ id: 'memory', kind: 'measurement', summary: 'Deux instantanés à 500 ms d’intervalle : tas JavaScript, documents, nœuds DOM et écouteurs.', artifact: 'memory.json' });
    limitations.push('Mesures ponctuelles de la page d’entrée. Aucun heap snapshot, cycle utilisateur répété, collecte forcée du garbage collector ou diagnostic de fuite mémoire. Les variations peuvent être normales. Pas de RAM serveur, GPU ou application native.');
  } else if (task === 'security') {
    const consoleErrors: string[] = [], pageErrors: string[] = [], mixedRequests: string[] = [];
    page.on('console', m => { if (m.type() === 'error' && consoleErrors.length < 100) consoleErrors.push(safeMessage(m.text())); });
    page.on('pageerror', e => { if (pageErrors.length < 100) pageErrors.push(safeMessage(e.message)); });
    page.on('request', r => { if (url.startsWith('https:') && r.url().startsWith('http:') && mixedRequests.length < 100) mixedRequests.push(publicUrl(r.url())); });
    const response = await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(300);
    const all = await response?.allHeaders() ?? {};
    const names = ['content-security-policy', 'content-security-policy-report-only', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'strict-transport-security', 'x-frame-options'];
    const headers = Object.fromEntries(names.map(name => [name, all[name] ?? null]));
    const current = new URL(page.url()), local = ['localhost', '127.0.0.1', '[::1]'].includes(current.hostname);
    await writeFile(join(artifactDir, 'browser-security.json'), JSON.stringify({ url: publicUrl(page.url()), local, secureContext: await page.evaluate(() => window.isSecureContext), headers, consoleErrors, pageErrors, mixedRequests }, null, 2));
    const add = (id: string, title: string, description: string, recommendation: string, severity: Finding['severity'] = 'info') => findings.push({ id, title, description, recommendation, severity, confidence: 'confirmed', evidenceIds: ['browser-security'] });
    if (!all['content-security-policy']) add('csp-missing', 'Aucune CSP d’application dans la réponse observée', 'L’en-tête Content-Security-Policy n’est pas présent sur cette réponse. Ce constat seul ne démontre pas une vulnérabilité.', 'Examiner la politique adaptée au produit et les en-têtes de production. Une CSP en balise meta et les protections du proxy restent à examiner.');
    if (!local && current.protocol === 'http:') add('plain-http', 'Page observée en HTTP', 'La page finale utilise HTTP, hors adresse locale reconnue.', 'Vérifier HTTPS et la configuration de déploiement autorisée.', 'minor');
    if (mixedRequests.length) add('mixed-content', 'Requêtes HTTP depuis une page HTTPS', `${mixedRequests.length} requête(s) HTTP observée(s). Leur acceptation ou blocage reste à vérifier.`, 'Vérifier les ressources concernées et leur disponibilité en HTTPS.', 'minor');
    if (pageErrors.length) add('page-errors', 'Erreurs JavaScript pendant le chargement', `${pageErrors.length} erreur(s) de page enregistrée(s). Leur conséquence fonctionnelle reste à vérifier.`, 'Reproduire les erreurs et identifier les parcours affectés.', 'minor');
    measurements.push({ name: 'browser.console-errors', value: consoleErrors.length, unit: 'count', context: {} }, { name: 'browser.page-errors', value: pageErrors.length, unit: 'count', context: {} });
    evidence.push({ id: 'browser-security', kind: 'runtime-observation', summary: 'En-têtes de sécurité observés, contexte HTTPS/local et erreurs navigateur, sans test offensif.', artifact: 'browser-security.json' });
    limitations.push('Contrôles passifs sur la page d’entrée : aucun pentest, scan de dépendances, contrôle des droits, audit de certificat complet, conformité ou garantie de sécurité. Les en-têtes locaux peuvent différer de la production. L’absence d’un en-tête n’est pas une preuve d’exploitation.', 'Les messages de console sont des preuves techniques locales, avec masquage limité des secrets évidents. Les relire avant de partager le dossier brut. Les corps de requête, cookies et en-têtes d’authentification ne sont pas enregistrés.');
  } else throw new Error(`Diagnostic inconnu : ${task}`);
  await session.detach();
  return OutputSchema.parse({ findings, evidence, measurements, limitations, toolVersions });
}
