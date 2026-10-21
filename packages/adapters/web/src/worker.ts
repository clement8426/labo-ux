import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import type { Browser, Page, Locator } from 'playwright-core';
import { OutputSchema, type Plan, type Target, type Action, type Output, type Evidence, type Finding } from '../../../contracts/src/index.js';
import { resourceDiagnostics, lighthouseDiagnostics, type ResourceObservation } from './diagnostics.js';
import { browserDiagnostics } from './browser-diagnostics.js';
import { inspectDesign } from './design.js';

let browser: Browser | undefined, cancelled = false;
let chromeProcess: { kill: () => void | Promise<unknown> } | undefined;
const require = createRequire(import.meta.url);
const optionalModules = { playwright: 'playwright', axe: '@axe-core/playwright', lighthouse: 'lighthouse', chrome: 'chrome-launcher' };
function locator(page: Page, action: Action): Locator {
  const l = action.locator!;
  if (l.testId) return page.getByTestId(l.testId);
  if (l.role) return page.getByRole(l.role as Parameters<Page['getByRole']>[0], { name: l.name, exact: true });
  return page.getByText(l.text!, { exact: true });
}
function safeUrl(path: string | undefined, baseUrl: string): string {
  const base = new URL(baseUrl), url = new URL(path ?? '', base);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin) throw new Error('Navigation hors de l’origine de test non prise en charge');
  return url.href;
}
async function act(page: Page, step: Action, baseUrl: string): Promise<void> {
  switch (step.action) {
    case 'open-target': case 'open-url': await page.goto(safeUrl(step.path, baseUrl), { waitUntil: 'domcontentloaded' }); break;
    case 'activate': await locator(page, step).click(); break;
    case 'enter-text': await locator(page, step).fill(step.value!); break;
    case 'select': await locator(page, step).selectOption(step.value!); break;
    case 'scroll': await page.mouse.wheel(0, Number(step.value ?? 600)); break;
    case 'go-back': await page.goBack({ waitUntil: 'domcontentloaded' }); break;
    case 'expect-visible': await locator(page, step).waitFor({ state: 'visible' }); break;
    case 'expect-text': { const l = locator(page, step); await l.waitFor({ state: 'visible' }); if (!(await l.innerText()).includes(step.expected!)) throw new Error(`Texte attendu absent : ${step.expected}`); break; }
    case 'expect-state': {
      const l = locator(page, step), ok = step.expected === 'enabled' ? await l.isEnabled() : step.expected === 'disabled' ? await l.isDisabled() : step.expected === 'checked' ? await l.isChecked() : !(await l.isChecked());
      if (!ok) throw new Error(`État attendu absent : ${step.expected}`); break;
    }
    case 'checkpoint': await page.screenshot({ path: step.value!, fullPage: true }); break;
    default: throw new Error(`Action non prise en charge par le pilote web : ${step.action}`);
  }
}
async function run(task: string, plan: Plan, target: Target, artifactDir: string): Promise<Output> {
  const evidence: Evidence[] = [], findings: Finding[] = [], limitations: string[] = [];
  const { chromium }: typeof import('playwright-core') = await import(optionalModules.playwright);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage();
  page.setDefaultTimeout(8000); page.setDefaultNavigationTimeout(20000);
  const url = safeUrl(undefined, target.baseUrl!);
  const tools = { playwright: require('playwright/package.json').version, browser: browser.version() };
  if (['network', 'memory', 'security'].includes(task)) return browserDiagnostics(task, context, page, url, artifactDir, tools);
  const responses: ResourceObservation[] = [], pendingResponses: Promise<void>[] = [];
  if (task === 'resources') page.on('response', response => {
    const pending = (async () => {
      const headers = await response.allHeaders();
      responses.push({ url: response.url(), type: response.request().resourceType(), status: response.status(), cacheControl: headers['cache-control'] ?? '', contentType: headers['content-type'] ?? '',
        encodedBodySize: /^\d+$/.test(headers['content-length'] ?? '') ? Number(headers['content-length']) : null, transferSize: null, durationMs: null });
    })();
    pendingResponses.push(pending);
  });
  await page.goto(url, { waitUntil: 'load' });
  if (task === 'journeys') {
    const journeys = plan.journeys.filter(j => j.targetId === target.id);
    if (!journeys.length) return OutputSchema.parse({ executionStatus: 'partial', limitations: ['Aucun parcours configuré.'], toolVersions: tools });
    for (const j of journeys) {
      if (cancelled) throw new Error('CANCELLED');
      if (j.mutatesData && !plan.permissions.dataMutation) { limitations.push(`${j.id} : mutation de données non autorisée`); continue; }
      const unsupported = j.steps.filter(s => ['launch-app', 'open-deep-link', 'set-orientation', 'background-app', 'foreground-app', 'handle-permission'].includes(s.action));
      if (unsupported.length) { limitations.push(`${j.id} : actions non prises en charge (${unsupported.map(s => s.action).join(', ')}) ; parcours non lancé`); continue; }
      const c = await browser.newContext(), p = await c.newPage(); p.setDefaultTimeout(8000);
      await c.tracing.start({ screenshots: true, snapshots: true });
      let stepIndex = 0;
      try {
        await p.goto(url);
        for (const step of j.steps) {
          if (cancelled) throw new Error('CANCELLED');
          stepIndex++;
          const safeStep = step.action === 'checkpoint' ? { ...step, value: join(artifactDir, `${j.id}-${stepIndex}.png`) } : step;
          await act(p, safeStep, url);
          evidence.push({ id: `${j.id}-${stepIndex}`, kind: 'runtime-observation', summary: `${j.name} : étape ${stepIndex} (${step.action}) exécutée`, ...(step.action === 'checkpoint' ? { artifact: `${j.id}-${stepIndex}.png` } : {}) });
        }
        limitations.push(`${j.id} : les étapes et assertions explicites ont été vérifiées ; objectif métier et préconditions restent à interpréter.`);
      } catch (error) {
        const id = `${j.id}-failure`;
        await p.screenshot({ path: join(artifactDir, `${j.id}-failure.png`), fullPage: true }).catch(() => {});
        evidence.push({ id, kind: 'runtime-observation', summary: `Échec à l’étape ${stepIndex} : ${String(error)}`, artifact: `${j.id}-failure.png` });
        findings.push({ id, title: 'Parcours interrompu : cause à confirmer', description: String(error), severity: 'major', recommendation: 'Vérifier les préconditions, le sélecteur, l’environnement et l’interface avant d’attribuer cet échec au produit.', evidenceIds: [id], confidence: 'hypothesis' });
      } finally {
        await c.tracing.stop({ path: join(artifactDir, `${j.id}-trace.zip`) }); await c.close();
        evidence.push({ id: `${j.id}-trace`, kind: 'runtime-observation', summary: 'Trace Playwright du parcours', artifact: `${j.id}-trace.zip` });
      }
    }
  } else if (task === 'axe-states') {
    const journeys = plan.journeys.filter(j => j.targetId === target.id && j.steps.some(s => s.action === 'checkpoint'));
    if (!journeys.length) return OutputSchema.parse({ executionStatus: 'partial', limitations: ['Aucun checkpoint dans les parcours : aucun état supplémentaire analysé. Ajouter des checkpoints explicites pour demander une analyse axe de ces états.'], toolVersions: tools });
    const { default: AxeBuilder } = await import(optionalModules.axe);
    let scanned = 0;
    for (const journey of journeys) {
      if (journey.mutatesData && !plan.permissions.dataMutation) { limitations.push(`${journey.id} : mutation non autorisée, parcours non lancé`); continue; }
      if (journey.steps.some(s => ['launch-app', 'open-deep-link', 'set-orientation', 'background-app', 'foreground-app', 'handle-permission'].includes(s.action))) { limitations.push(`${journey.id} : actions natives non prises en charge, parcours non lancé`); continue; }
      const c = await browser.newContext({ viewport: { width: 1280, height: 900 } }), p = await c.newPage();
      p.setDefaultTimeout(8000); p.setDefaultNavigationTimeout(20000);
      let stepIndex = 0, journeyScanned = 0;
      const expectedCheckpoints = journey.steps.filter(s => s.action === 'checkpoint').length;
      try {
        await p.goto(url);
        for (const step of journey.steps) {
          if (cancelled) throw new Error('CANCELLED');
          stepIndex++;
          if (step.action !== 'checkpoint') { await act(p, step, url); continue; }
          const id = `${journey.id}-${stepIndex}`, result = await new AxeBuilder({ page: p }).analyze();
          await writeFile(join(artifactDir, `${id}.axe.json`), JSON.stringify(result, null, 2));
          await p.screenshot({ path: join(artifactDir, `${id}.png`), fullPage: true });
          evidence.push({ id, kind: 'measurement', summary: `${journey.name}, checkpoint ${stepIndex} : ${result.violations.length} règle(s) axe en violation, ${result.incomplete.length} à revoir`, artifact: `${id}.axe.json` });
          evidence.push({ id: `${id}-screen`, kind: 'runtime-observation', summary: 'État réellement analysé', artifact: `${id}.png` });
          for (const violation of result.violations) findings.push({ id: `${id}.${violation.id}`, title: violation.help, description: `${journey.name}, checkpoint ${stepIndex} : ${violation.description} (${violation.nodes.length} élément(s))`, recommendation: `Consulter ${violation.helpUrl} et les sélecteurs de cette preuve.`, severity: violation.impact === 'critical' ? 'critical' : violation.impact === 'serious' ? 'major' : 'minor', confidence: 'confirmed', evidenceIds: [id, `${id}-screen`] });
          scanned++;
          journeyScanned++;
          if (journeyScanned === expectedCheckpoints) break;
        }
      } catch (error) { if (cancelled) throw error; limitations.push(`${journey.id} : parcours arrêté à l’étape ${stepIndex}, les checkpoints suivants ne sont pas couverts (${String(error)})`); }
      finally { await c.close(); }
    }
    limitations.push(`${scanned} état(s) explicitement analysé(s). Chaque parcours est rejoué jusqu’à son dernier checkpoint avec ses permissions ; un arrêt avant ce point laisse les checkpoints suivants non couverts. Les assertions finales relèvent du contrôle friction.run-journey. Aucun contrôle manuel clavier ou lecteur d’écran n’est remplacé.`);
    return OutputSchema.parse({ executionStatus: limitations.some(l => /non autorisée|non lancé|arrêté/.test(l)) || !scanned ? 'partial' : 'completed', findings, evidence, limitations, toolVersions: tools });
  } else if (task === 'resources') {
    await Promise.all(pendingResponses);
    const timings = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => {
      const e = entry as PerformanceResourceTiming;
      return { url: e.name, encodedBodySize: e.encodedBodySize, transferSize: e.transferSize, durationMs: e.duration };
    }));
    // Preserve individual response observations, including repeated requests.
    const remaining = [...timings];
    for (const response of responses) {
      const index = remaining.findIndex(t => t.url === response.url);
      const timing = index < 0 ? undefined : remaining.splice(index, 1)[0];
      if (timing) {
        if (timing.encodedBodySize > 0) response.encodedBodySize = timing.encodedBodySize;
        response.transferSize = timing.transferSize > 0 ? timing.transferSize : null;
        response.durationMs = timing.durationMs;
      }
    }
    const images = await page.locator('img').evaluateAll(elements => elements.map(element => { const img = element as HTMLImageElement; return { url: img.currentSrc || img.src, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, displayedWidth: img.getBoundingClientRect().width, displayedHeight: img.getBoundingClientRect().height, loading: img.loading || 'auto', widthAttribute: img.getAttribute('width'), heightAttribute: img.getAttribute('height') }; }));
    await writeFile(join(artifactDir, 'resources.json'), JSON.stringify({ pageUrl: url, viewport: { width: 1280, height: 900 }, responses, images }, null, 2));
    const diagnostics = resourceDiagnostics(responses, url);
    return OutputSchema.parse({ ...diagnostics, evidence: [{ id: 'resources', kind: 'measurement', summary: `${responses.length} réponse(s) observée(s), ${images.length} image(s) dans le DOM`, artifact: 'resources.json' }], toolVersions: tools,
      limitations: ['Chargement initial, cache navigateur neuf, sans défilement ni interaction. Tailles inconnues conservées comme inconnues ; aucune simulation de réseau dans ce contrôle. Les headers ne prouvent pas l’absence de cache serveur. Aucun défaut déduit du seul format PNG ou de dimensions HTML absentes.'] });
  } else if (task === 'axe') {
    const { default: AxeBuilder } = await import(optionalModules.axe);
    const result = await new AxeBuilder({ page }).analyze();
    await writeFile(join(artifactDir, 'axe.json'), JSON.stringify(result, null, 2));
    evidence.push({ id: 'axe', kind: 'measurement', summary: `${result.violations.length} règle(s) axe en violation ; ${result.incomplete.length} à revoir`, artifact: 'axe.json' });
    for (const v of result.violations) findings.push({ id: v.id, title: v.help, description: `${v.description} (${v.nodes.length} élément(s))`, recommendation: `Consulter ${v.helpUrl} et les sélecteurs dans la preuve.`, severity: v.impact === 'critical' ? 'critical' : v.impact === 'serious' ? 'major' : 'minor', evidenceIds: ['axe'], confidence: 'confirmed' });
    limitations.push('Page d’entrée uniquement, état courant. Clavier, technologies d’assistance, états protégés et autres écrans restent à vérifier.');
  } else if (task === 'styles') {
    const result = await inspectDesign(page, url, artifactDir, plan.design);
    return OutputSchema.parse({ ...result, toolVersions: { ...tools, ...result.toolVersions } });
  } else if (task === 'copy') {
    const controls = await page.locator('button, label, input, [role="alert"], [role="status"], [aria-label]').evaluateAll(elements => elements.slice(0, 500).map(el => ({ tag: el.tagName, text: el.textContent?.trim(), label: el.getAttribute('aria-label'), placeholder: el.getAttribute('placeholder') })));
    await writeFile(join(artifactDir, 'copy.json'), JSON.stringify(controls, null, 2));
    evidence.push({ id: 'copy', kind: 'runtime-observation', summary: `${controls.length} chaînes/contrôles de l’état courant (y compris éléments masqués dans le DOM)`, artifact: 'copy.json' });
    limitations.push('Inventaire DOM, sans appréciation éditoriale par un modèle. Visibilité, états vides, erreurs et traductions à interpréter dans leur contexte.');
  } else if (task === 'lighthouse') {
    await browser.close(); browser = undefined;
    const { launch } = await import(optionalModules.chrome), { default: lighthouse } = await import(optionalModules.lighthouse);
    const chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless', '--no-first-run'] });
    chromeProcess = chrome;
    try {
      const result = await lighthouse(url, { port: chrome.port, output: ['json', 'html'], onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'], logLevel: 'error' });
      if (!result || result.lhr.runtimeError) throw new Error(`Lighthouse : ${result?.lhr.runtimeError?.message ?? 'résultat absent'}`);
      await writeFile(join(artifactDir, 'lighthouse.json'), JSON.stringify(result.lhr));
      const reports = Array.isArray(result.report) ? result.report : [result.report];
      const reportHtml = reports.find((value: string) => /^\s*(?:<!--[\s\S]*?-->\s*)*(?:<!doctype\s+html\b|<html\b)/i.test(value));
      const lighthouseEvidence: Evidence[] = [{ id: 'lighthouse', kind: 'measurement', summary: `Lighthouse ${result.lhr.lighthouseVersion} ; mesures de laboratoire individuelles`, artifact: 'lighthouse.json' }];
      const captureLimitations: string[] = [];
      if (reportHtml) {
        await writeFile(join(artifactDir, 'lighthouse.html'), reportHtml);
        lighthouseEvidence.push({ id: 'lighthouse-html', kind: 'measurement', summary: 'Rapport Lighthouse officiel interactif : performance, accessibilité, bonnes pratiques et SEO sur la page d’entrée.', artifact: 'lighthouse.html' });
        const captureBrowser = await chromium.launch({ headless: true });
        try {
          const captureContext = await captureBrowser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
          await captureContext.route('**/*', route => route.abort());
          const capturePage = await captureContext.newPage();
          await capturePage.setContent(reportHtml, { waitUntil: 'load' });
          await capturePage.locator('.lh-category').first().waitFor({ timeout: 10000 });
          await capturePage.screenshot({ path: join(artifactDir, 'lighthouse-report.png') });
          lighthouseEvidence.push({ id: 'lighthouse-screen', kind: 'runtime-observation', summary: 'Capture du rapport Lighthouse de cette exécution, pas une capture du panneau DevTools.', artifact: 'lighthouse-report.png' });
        } catch (error) { captureLimitations.push(`Capture Lighthouse indisponible ; rapports HTML/JSON conservés : ${String(error)}`); }
        finally { await captureBrowser.close(); }
      } else captureLimitations.push('Rapport Lighthouse HTML absent de la sortie de l’outil ; JSON conservé.');
      return OutputSchema.parse({ executionStatus: captureLimitations.length ? 'partial' : 'completed', findings: lighthouseDiagnostics(result.lhr), measurements: ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index'].flatMap(name => {
        const a = result.lhr.audits[name]; return typeof a?.numericValue === 'number' ? [{ name, value: a.numericValue, unit: a.numericUnit ?? 'unknown', context: { source: 'Lighthouse lab', url, formFactor: result.lhr.configSettings.formFactor, profile: target.buildProfile } }] : [];
      }), evidence: lighthouseEvidence, toolVersions: { ...tools, lighthouse: result.lhr.lighthouseVersion }, limitations: ['Une seule mesure sur la page d’entrée, selon le profil Lighthouse enregistré dans le JSON. Aucun résultat natif ni mesure terrain. États d’attente et double soumission non vérifiés.', 'Les scores Lighthouse ne sont ni un score UX global ni une certification d’accessibilité ou de sécurité. Les bonnes pratiques ne constituent pas un audit de sécurité.', ...captureLimitations] });
    } finally { await chrome.kill(); chromeProcess = undefined; }
  } else throw new Error(`Tâche web inconnue : ${task}`);
  await page.screenshot({ path: join(artifactDir, 'screen.png'), fullPage: true });
  evidence.push({ id: 'screen', kind: 'runtime-observation', summary: 'Page d’entrée dans son état courant', artifact: 'screen.png' });
  return OutputSchema.parse({ executionStatus: task === 'journeys' && limitations.some(l => /non autorisée|non lancé/.test(l)) ? 'partial' : 'completed', findings, evidence, limitations, toolVersions: tools });
}
process.on('message', async (message: any) => {
  if (message.cancel) { cancelled = true; await Promise.allSettled([browser?.close(), chromeProcess?.kill()]); process.exit(1); }
  let response: unknown;
  try { response = { result: await run(message.task, message.plan, message.target, message.artifactDir) }; }
  catch (error) { response = { error: String(error) }; }
  finally { await browser?.close().catch(() => {}); }
  process.send?.(response, () => process.exit(0));
});
process.on('disconnect', async () => { cancelled = true; await Promise.allSettled([browser?.close(), chromeProcess?.kill()]); process.exit(1); });
