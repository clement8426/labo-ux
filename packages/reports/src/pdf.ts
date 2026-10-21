import { readFile, writeFile, realpath, stat } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, extname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { rename, rm } from 'node:fs/promises';
import { renderClientHtml, type ClientOptions } from './client.js';
import type { Report } from './index.js';

const jobs = new Map<string, { key: string; promise: Promise<{ pdf: string; html: string }> }>();
export async function exportClientPdf(directory: string, options: ClientOptions = {}): Promise<{ pdf: string; html: string }> {
  const root = await realpath(directory), key = JSON.stringify(options);
  const existing = jobs.get(root); if (existing?.key === key) return existing.promise;
  const job = (existing?.promise.catch(() => undefined) ?? Promise.resolve()).then(() => generate(root, options))
    .finally(() => { if (jobs.get(root)?.promise === job) jobs.delete(root); });
  jobs.set(root, { key, promise: job }); return job;
}
async function generate(root: string, options: ClientOptions) {
  const raw = await readFile(join(root, 'report.json'), 'utf8'), report: Report = JSON.parse(raw);
  const metadataPath = join(root, '.client-export.json');
  let previous: { hash: string; options: ClientOptions } | undefined;
  try { previous = JSON.parse(await readFile(metadataPath, 'utf8')); } catch { /* Premier export. */ }
  // Le téléchargement depuis le rapport conserve le nom du client et de l’auteur déjà renseignés.
  const effectiveOptions = Object.values(options).some(value => value !== undefined) ? options : previous?.options ?? {};
  const hash = createHash('sha256').update(raw).update(JSON.stringify(effectiveOptions)).update(renderClientHtml.toString()).digest('hex');
  const htmlPath = join(root, 'client.html'), pdfPath = join(root, 'client.pdf');
  if (previous?.hash === hash) {
    try { await stat(pdfPath); await stat(htmlPath); return { pdf: pdfPath, html: htmlPath }; } catch { /* Export incomplet : régénérer. */ }
  }
  const images = new Map<string, string>(), candidates = report.results.flatMap(r => r.evidence.filter(e => e.artifact && /\.(?:png|jpe?g)$/.test(e.artifact)).map(e => e.artifact!));
  // Le PDF reste autonome ; seuls les fichiers de preuve de cet audit peuvent être incorporés.
  const ordered = [...new Set(candidates)].sort((a, b) => Number(b.endsWith('lighthouse-report.png')) - Number(a.endsWith('lighthouse-report.png')));
  let bytes = 0;
  const perCheck = new Map<string, number>(), entryTargets = new Set<string>();
  for (const artifact of ordered) {
    if (images.size >= 8) break;
    const check = artifact.split('/').slice(0, 2).join('/'), target = artifact.split('/')[0]!;
    if ((perCheck.get(check) ?? 0) >= 2 || (artifact.endsWith('/screen.png') && entryTargets.has(target))) continue;
    try {
      const base = await realpath(join(root, 'evidence')), file = await realpath(resolve(base, artifact)), rel = relative(base, file);
      if (rel.startsWith('..') || isAbsolute(rel) || (await stat(file)).size > 5_000_000) continue;
      const data = await readFile(file); if (bytes + data.length > 20_000_000) continue;
      const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpg = data[0] === 255 && data[1] === 216 && data[2] === 255;
      if ((!png && !jpg) || !['.png', '.jpg', '.jpeg'].includes(extname(file))) continue;
      images.set(artifact, `data:${png ? 'image/png' : 'image/jpeg'};base64,${data.toString('base64')}`); bytes += data.length;
      perCheck.set(check, (perCheck.get(check) ?? 0) + 1);
      if (artifact.endsWith('/screen.png')) entryTargets.add(target);
    } catch { /* Preuve absente ou illisible : le constat textuel et son identifiant restent présents. */ }
  }
  const html = renderClientHtml(report, images, effectiveOptions);
  const moduleName = 'playwright';
  const { chromium }: typeof import('playwright-core') = await import(moduleName);
  const browser = await chromium.launch({ headless: true });
  const temp = join(root, `.client-${randomUUID()}.pdf`);
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode())); });
    await page.pdf({ path: temp, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: '<div style="font:8px Arial;color:#687085;width:100%;padding:0 15mm;display:flex;justify-content:space-between"><span>Labo UX - Rapport d’audit</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
    await rename(temp, pdfPath); await writeFile(htmlPath, html);
    await writeFile(metadataPath, JSON.stringify({ hash, options: effectiveOptions }));
    return { pdf: pdfPath, html: htmlPath };
  } finally { await browser.close(); await rm(temp, { force: true }); }
}
