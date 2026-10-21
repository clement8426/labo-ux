import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { access, mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { serveReport } from '../../packages/reports/src/server.js';
let available = false; try { await access(chromium.executablePath()); available = true; } catch { /* Browser capability is optional. */ }
it.skipIf(!available)('mesure réseau/cache/mémoire et indicateurs passifs, puis livre un vrai PDF depuis le rapport', async () => {
  const root = await mkdtemp(join(tmpdir(), 'labo-technical-'));
  const body = '<!doctype html><html lang="fr"><title>Fixture technique</title><main><h1>Sortie fictive</h1><script src="/asset.js?token=fake-secret"></script><img src="/missing.png" alt="Décor"></main></html>';
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/asset.js')) { res.setHeader('Cache-Control', 'public,max-age=3600'); res.setHeader('Content-Type', 'application/javascript'); res.end('console.error("diagnostic fictif token=cache-secret");' + ' '.repeat(10000)); }
    else if (req.url?.startsWith('/missing')) { res.writeHead(404); res.end(); }
    else { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'text/html'); res.end(body); }
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  let reports: Awaited<ReturnType<typeof serveReport>> | undefined;
  try {
    const port = (server.address() as { port: number }).port, outputDir = join(root, '.labo-ux'), config = join(root, 'audit.json');
    await writeFile(join(root, 'index.html'), body);
    await writeFile(config, JSON.stringify({ projectRoot: root, outputDir, confirmed: true, targets: [{ id: 'web', kind: 'web', baseUrl: `http://127.0.0.1:${port}` }], permissions: { runtime: true }, checks: ['technical.inspect-network', 'technical.measure-memory', 'technical.inspect-security'] }));
    const { stdout } = await promisify(execFile)(process.execPath, [resolve('dist/packages/cli/src/index.js'), 'run', '--config', config], { timeout: 90000 });
    const { state } = JSON.parse(stdout), directory = join(outputDir, state.id), report = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'));
    expect(report.results).toHaveLength(3); expect(report.results.every((r: any) => r.executionStatus === 'completed')).toBe(true);
    const network = report.results.find((r: any) => r.nodeId === 'technical.inspect-network');
    expect(network.measurements.find((m: any) => m.name === 'network.warm.cache-hits').value).toBeGreaterThan(0);
    const raw = await readFile(join(directory, 'evidence', network.evidence[0].artifact), 'utf8'); expect(raw).not.toContain('fake-secret');
    expect(report.results.find((r: any) => r.nodeId === 'technical.measure-memory').measurements.some((m: any) => m.name === 'memory.js-heap-used' && m.value > 0)).toBe(true);
    const security = report.results.find((r: any) => r.nodeId === 'technical.inspect-security');
    expect(security.findings.some((f: any) => f.id === 'plain-http')).toBe(false);
    expect(await readFile(join(directory, 'evidence', security.evidence[0].artifact), 'utf8')).not.toContain('cache-secret');
    reports = await serveReport(directory, 0); const reportUrl = `http://127.0.0.1:${(reports.address() as { port: number }).port}`;
    const pdf = await fetch(`${reportUrl}/client.pdf`); const bytes = Buffer.from(await pdf.arrayBuffer());
    expect(pdf.status).toBe(200); expect(pdf.headers.get('content-type')).toBe('application/pdf'); expect(bytes.subarray(0, 5).toString()).toBe('%PDF-'); expect(bytes.length).toBeGreaterThan(15000);
    expect((await fetch(`${reportUrl}/run.json`)).status).toBe(404);
    const cliPdf = await promisify(execFile)(process.execPath, [resolve('dist/packages/cli/src/index.js'), 'export-pdf', state.id, '--output', outputDir, '--client', 'Agence fictive'], { timeout: 30000 });
    expect(JSON.parse(cliPdf.stdout).pdf).toBe(await realpath(join(directory, 'client.pdf')));
    expect(await readFile(join(directory, 'client.html'), 'utf8')).toContain('Agence fictive');
    expect((await fetch(`${reportUrl}/client.pdf`)).status).toBe(200);
    expect(await readFile(join(directory, 'client.html'), 'utf8')).toContain('Agence fictive');
  } finally {
    if (reports) await new Promise<void>(r => reports!.close(() => r())); await new Promise<void>(r => server.close(() => r()));
    const target = resolve(root), rel = relative(resolve(tmpdir()), target);
    if (isAbsolute(rel) || rel.startsWith('..') || !rel.startsWith('labo-technical-')) throw new Error('Dossier temporaire inattendu : suppression refusée');
    await rm(target, { recursive: true, force: true });
  }
}, 120000);
