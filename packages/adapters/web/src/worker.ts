import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import type { Browser, Page, Locator } from 'playwright-core';
import { OutputSchema, type Plan, type Target, type Action, type Output, type Evidence, type Finding } from '../../../contracts/src/index.js';

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
  await page.goto(url, { waitUntil: 'load' });
  const tools = { playwright: require('playwright/package.json').version, browser: browser.version() };
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
  } else if (task === 'axe') {
    const { default: AxeBuilder } = await import(optionalModules.axe);
    const result = await new AxeBuilder({ page }).analyze();
    await writeFile(join(artifactDir, 'axe.json'), JSON.stringify(result, null, 2));
    evidence.push({ id: 'axe', kind: 'measurement', summary: `${result.violations.length} règle(s) axe en violation ; ${result.incomplete.length} à revoir`, artifact: 'axe.json' });
    for (const v of result.violations) findings.push({ id: v.id, title: v.help, description: `${v.description} (${v.nodes.length} élément(s))`, recommendation: `Consulter ${v.helpUrl} et les sélecteurs dans la preuve.`, severity: v.impact === 'critical' ? 'critical' : v.impact === 'serious' ? 'major' : 'minor', evidenceIds: ['axe'], confidence: 'confirmed' });
    limitations.push('Page d’entrée uniquement, état courant. Clavier, technologies d’assistance, états protégés et autres écrans restent à vérifier.');
  } else if (task === 'styles') {
    const styles = await page.locator('button, h1, h2, input, [role="button"]').evaluateAll(elements => elements.slice(0, 300).map(el => { const s = getComputedStyle(el); return { tag: el.tagName, text: el.textContent?.trim().slice(0, 120), font: s.font, color: s.color, background: s.backgroundColor, padding: s.padding, borderRadius: s.borderRadius, unit: 'CSS px' }; }));
    await writeFile(join(artifactDir, 'styles.json'), JSON.stringify(styles, null, 2));
    evidence.push({ id: 'styles', kind: 'runtime-observation', summary: `${styles.length} composants observés, viewport 1280 × 900 CSS px`, artifact: 'styles.json' });
    limitations.push('Inventaire du rendu de la page d’entrée, sans comparaison automatique des rôles ou des états entre pages.');
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
      const result = await lighthouse(url, { port: chrome.port, output: 'json', onlyCategories: ['performance'], logLevel: 'error' });
      if (!result || result.lhr.runtimeError) throw new Error(`Lighthouse : ${result?.lhr.runtimeError?.message ?? 'résultat absent'}`);
      await writeFile(join(artifactDir, 'lighthouse.json'), typeof result.report === 'string' ? result.report : JSON.stringify(result.lhr));
      return OutputSchema.parse({ measurements: ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index'].flatMap(name => {
        const a = result.lhr.audits[name]; return typeof a?.numericValue === 'number' ? [{ name, value: a.numericValue, unit: a.numericUnit ?? 'unknown', context: { source: 'Lighthouse lab', url, formFactor: result.lhr.configSettings.formFactor, profile: target.buildProfile } }] : [];
      }), evidence: [{ id: 'lighthouse', kind: 'measurement', summary: `Lighthouse ${result.lhr.lighthouseVersion} ; mesures de laboratoire individuelles`, artifact: 'lighthouse.json' }], toolVersions: { ...tools, lighthouse: result.lhr.lighthouseVersion }, limitations: ['Une seule mesure sur la page d’entrée, selon le profil Lighthouse enregistré dans le JSON. Aucun résultat natif ni mesure terrain. États d’attente et double soumission non vérifiés.'] });
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
