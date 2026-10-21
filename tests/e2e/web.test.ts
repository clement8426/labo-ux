import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
const exec = promisify(execFile);
let available = false; try { await access(chromium.executablePath()); available = true; } catch { /* Explicitly skipped without optional browser. */ }
it.skipIf(!available)('audite une fixture réelle avec axe, collecte des preuves et exécute un parcours', async () => {
  const root = await mkdtemp(join(tmpdir(), 'labo-web-')), body = await readFile('fixtures/web-showcase/index.html', 'utf8');
  const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(req.url?.includes('clean') ? body.replace('<img src=', '<img alt="" src=') : body); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); const port = (server.address() as any).port;
  try {
    await writeFile(join(root, 'index.html'), body);
    const config = join(root, 'audit.json'), outputDir = join(root, '.labo-ux');
    await writeFile(config, JSON.stringify({ projectRoot: root, outputDir, confirmed: true, targets: [{ id: 'web', kind: 'web', baseUrl: `http://127.0.0.1:${port}` }],
      checks: ['a11y.scan-screen', 'copy.collect-controls', 'design.collect-styles', 'friction.run-journey'], permissions: { runtime: true, dataMutation: true }, timeoutMs: 60000,
      journeys: [{ id: 'contact', name: 'Contact', targetId: 'web', preconditions: ['Fixture sans données réelles'], expectedOutcome: 'Confirmation visible', mutatesData: true,
        steps: [{ action: 'enter-text', locator: { testId: 'email' }, value: 'test@example.test' }, { action: 'activate', locator: { role: 'button', name: 'Cliquez ici' } }, { action: 'expect-text', locator: { testId: 'confirmation' }, expected: 'demande fictive' }, { action: 'checkpoint' }] }] }));
    const { stdout } = await exec(process.execPath, [resolve('dist/packages/cli/src/index.js'), 'run', '--config', config], { timeout: 65000, maxBuffer: 1000000 });
    const result = JSON.parse(stdout), report = JSON.parse(await readFile(join(outputDir, result.state.id, 'report.json'), 'utf8'));
    expect(report.results).toHaveLength(4);
    expect(report.results.filter((r: any) => r.nodeId !== 'design.collect-styles').every((r: any) => r.executionStatus === 'completed')).toBe(true);
    const design = report.results.find((r: any) => r.nodeId === 'design.collect-styles');
    expect(design.executionStatus).toBe('partial'); // Aucun composant répété dans cette fixture de formulaire.
    expect(design.measurements.find((m: any) => m.name === 'design.compared-action-groups').value).toBe(0);
    const axe = report.results.find((r: any) => r.nodeId === 'a11y.scan-screen'); expect(axe.findings.some((f: any) => f.id === 'image-alt')).toBe(true);
    const journey = report.results.find((r: any) => r.nodeId === 'friction.run-journey'); expect(journey.findings).toHaveLength(0);
    await access(join(outputDir, result.state.id, 'evidence', journey.evidence.find((e: any) => e.artifact?.endsWith('.zip')).artifact));
    const previous = JSON.parse(await readFile(config, 'utf8')); previous.targets[0].baseUrl += '/clean'; previous.checks = ['a11y.scan-screen']; previous.journeys = [];
    await writeFile(config, JSON.stringify(previous));
    const clean = JSON.parse((await exec(process.execPath, [resolve('dist/packages/cli/src/index.js'), 'run', '--config', config], { timeout: 60000 })).stdout);
    const cleanReport = JSON.parse(await readFile(join(outputDir, clean.state.id, 'report.json'), 'utf8')); expect(cleanReport.results[0].findings.some((f: any) => f.id === 'image-alt')).toBe(false);
  } finally { await new Promise<void>(r => server.close(() => r())); await rm(root, { recursive: true, force: true }); }
}, 90000);
