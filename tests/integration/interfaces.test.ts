import { expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { PlanSchema } from '../../packages/contracts/src/index.js';
const exec = promisify(execFile);
it('expose le même catalogue et exécute un audit via MCP sans polluer stdout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'labo-mcp-')), outputDir = join(root, '.labo-ux'), client = new Client({ name: 'contract-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('dist/packages/mcp-server/src/index.js')], stderr: 'pipe' });
  try {
    await writeFile(join(root, 'index.html'), '<img src="fictive.png"><button>Cliquez ici</button>');
    await client.connect(transport); const tools = await client.listTools(); expect(tools.tools.map(t => t.name)).toContain('cancel_audit');
    const parse = (r: any) => JSON.parse(r.content[0].text);
    const cli = JSON.parse((await exec(process.execPath, ['dist/packages/cli/src/index.js', 'checks', 'list'])).stdout);
    const mcp = parse(await client.callTool({ name: 'list_checks', arguments: {} })); expect(mcp.map((c: any) => c.id)).toEqual(cli.map((c: any) => c.id));
    const plan = PlanSchema.parse({ projectRoot: root, outputDir, confirmed: true, targets: [{ id: 'web', kind: 'web' }] });
    const started = parse(await client.callTool({ name: 'start_audit', arguments: { plan } })); expect(started.runId).toBeTypeOf('string');
    let status: any;
    for (let i = 0; i < 100; i++) { status = parse(await client.callTool({ name: 'get_audit_status', arguments: { runId: started.runId, outputDir } })); if (status.state.status !== 'running') break; await new Promise(r => setTimeout(r, 20)); }
    expect(status.state.status).toBe('partial'); expect(status.completedNodes).toBe(cli.length);
    expect(status.state.plan.mode).toBe('audit'); expect(status.state.plan.permissions.codeModification).toBe(false);
    expect((await client.callTool({name:'get_debugging_plan',arguments:{runId:started.runId,outputDir}})).isError).toBe(true);
    const result = parse(await client.callTool({ name: 'get_audit_results', arguments: { runId: started.runId, outputDir, block: 'microcopy' } }));
    expect(result.results.every((r: any) => r.block === 'microcopy')).toBe(true); expect(result.results.some((r: any) => r.findings.length)).toBe(true);
    const bad = await client.callTool({ name: 'get_audit_evidence', arguments: { runId: started.runId, outputDir, artifact: '../../run.json' } }); expect(bad.isError).toBe(true);
    const config = join(root, 'audit.json'); await writeFile(config, JSON.stringify(plan));
    const run = JSON.parse((await exec(process.execPath, ['dist/packages/cli/src/index.js', 'run', '--config', config])).stdout);
    expect(run.state.status).toBe(status.state.status);
  } finally { await client.close(); await rm(root, { recursive: true, force: true }); }
});
