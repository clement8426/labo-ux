import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { access, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
let available = false;
try { await access(chromium.executablePath()); available = true; } catch { /* Explicit browser prerequisite. */ }
it.skipIf(!available)('audite les images et les états demandés, sans mutation interdite ni faux cache API', async () => {
  const root = await mkdtemp(join(tmpdir(), 'labo-diagnostics-'));
  let mutations = 0;
  const body = '<!doctype html><html lang="fr"><title>Fixture</title><main><h1>Demande</h1><img alt="Décor" src="/image.svg"><button data-testid="open" onclick="document.querySelector(\'#state\').hidden=false">Ouvrir</button><section id="state" hidden><input data-testid="unlabelled"><button data-testid="mutate" onclick="fetch(\'/api\',{method:\'POST\'})">Envoyer</button></section></main></html>';
  const image = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/><!--' + 'x'.repeat(1_100_000) + '--></svg>');
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/api') { mutations++; res.setHeader('Content-Type', 'application/json'); res.end('{}'); }
    else if (req.url === '/image.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.setHeader('Content-Length', image.length); res.end(image); }
    else { res.setHeader('Content-Type', 'text/html'); res.end(body); }
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  try {
    await writeFile(join(root, 'index.html'), body);
    const plan = { projectRoot: root, outputDir: join(root, '.labo-ux'), confirmed: true, targets: [{ id: 'web', kind: 'web', baseUrl: `http://127.0.0.1:${port}` }], permissions: { runtime: true, dataMutation: false },
      checks: ['performance.inspect-resources', 'a11y.scan-journey-states'],
      journeys: [{ id: 'modal', name: 'Formulaire ouvert', targetId: 'web', preconditions: ['Données fictives'], expectedOutcome: 'Formulaire visible', mutatesData: false, steps: [{ action: 'activate', locator: { testId: 'open' } }, { action: 'checkpoint' }] },
        { id: 'forbidden', name: 'Mutation interdite', targetId: 'web', preconditions: ['Ne pas lancer'], expectedOutcome: 'Aucune mutation', mutatesData: true, steps: [{ action: 'activate', locator: { testId: 'open' } }, { action: 'activate', locator: { testId: 'mutate' } }, { action: 'checkpoint' }] }]
    };
    const config = join(root, 'audit.json'); await writeFile(config, JSON.stringify(plan));
    const { stdout } = await promisify(execFile)(process.execPath, [resolve('dist/packages/cli/src/index.js'), 'run', '--config', config], { timeout: 90000 });
    const { state } = JSON.parse(stdout), report = JSON.parse(await readFile(join(plan.outputDir, state.id, 'report.json'), 'utf8'));
    const resources = report.results.find((r: any) => r.nodeId === 'performance.inspect-resources');
    expect(resources.executionStatus).toBe('completed');
    expect(resources.findings.map((f: any) => f.title)).toContain('Image de plus de 1 Mo transférée');
    expect(resources.findings.filter((f: any) => f.title === 'Image servie sans stockage en cache')).toHaveLength(1);
    const states = report.results.find((r: any) => r.nodeId === 'a11y.scan-journey-states');
    expect(states.executionStatus).toBe('partial');
    expect(states.findings.some((f: any) => f.id === 'modal-2.label')).toBe(true);
    expect(states.limitations.join(' ')).toContain('mutation non autorisée');
    expect(mutations).toBe(0);
    for (const r of report.results) for (const e of r.evidence) if (e.artifact) await access(join(plan.outputDir, state.id, 'evidence', e.artifact));
  } finally { await new Promise<void>(r => server.close(() => r())); await rm(root, { recursive: true, force: true }); }
}, 100000);
