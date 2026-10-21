import { it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PlanSchema, type Plan } from '../../packages/contracts/src/index.js';
import { AuditEngine } from '../../packages/core/src/index.js';
import { debuggingPlan, finishDebugging } from '../../packages/core/src/debugging.js';
import { define, output } from '../../packages/checks/src/helpers.js';
import { summarize, html } from '../../packages/reports/src/index.js';
import { readReport } from '../../packages/core/src/service.js';
it('audit par défaut, debug explicitement autorisé et permissions séparées des données de test', () => {
  const raw = { projectRoot: '.', targets: [{ id: 'web', kind: 'web' }] };
  const p = PlanSchema.parse(raw); expect(p.mode).toBe('audit'); expect(p.permissions.codeModification).toBe(false);
  expect(() => PlanSchema.parse({ ...raw, mode: 'audit', permissions: { codeModification: true } })).toThrow('mode audit');
  expect(() => PlanSchema.parse({ ...raw, mode: 'debug' })).toThrow('mode debug');
  expect(PlanSchema.parse({ ...raw, permissions: { dataMutation: true } }).mode).toBe('audit');
});
it('le CLI peut revenir en audit seul sans conserver une ancienne permission de réécriture', async()=>{
  const root=await mkdtemp(join(tmpdir(),'labo-cli-mode-')),source=join(root,'index.html'),config=join(root,'.labo-ux','config.json');
  const {mkdir}=await import('node:fs/promises');await mkdir(join(root,'.labo-ux'));await writeFile(source,'<button>OK</button>');
  const cli=resolve('dist/packages/cli/src/index.js'), plan={projectRoot:root,outputDir:join(root,'.labo-ux'),confirmed:true,mode:'debug',permissions:{codeModification:true},targets:[{id:'web',kind:'web'}],checks:['copy.review-context']};
  try{
    await writeFile(config,JSON.stringify(plan));
    const {stdout}=await promisify(execFile)(process.execPath,[cli,'run','--config',config,'--mode','audit']);
    const result=JSON.parse(stdout);expect(result.state.plan.mode).toBe('audit');expect(result.state.plan.permissions.codeModification).toBe(false);expect(await readFile(source,'utf8')).toBe('<button>OK</button>');
    await writeFile(config,JSON.stringify({...plan,mode:'audit',permissions:{codeModification:false}}));
    await expect(promisify(execFile)(process.execPath,[cli,'run','--config',config,'--mode','debug'])).rejects.toThrow();
    await expect(promisify(execFile)(process.execPath,[cli,'run','--config',config,'--mode','audit','--allow-code-changes'])).rejects.toThrow();
    await writeFile(config,JSON.stringify({...plan,checks:['a11y.native-audit']}));
    const blocked=JSON.parse((await promisify(execFile)(process.execPath,[cli,'run','--config',config])).stdout);
    expect(blocked.workflow.phase).toBe('blocked-before-corrections');expect(blocked.reports.files).toHaveLength(3);
  }finally{await rm(root,{recursive:true,force:true});}
});
it('impose audit initial, sources modifiées et nouvel audit équivalent avant le bilan de débogage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'labo-debug-')), source = join(root, 'index.html');
  await writeFile(source, 'cassé');
  const check = define('fixture.observation', 'microcopy', async ctx => output({ evidence: [{ id: 'e', kind: 'runtime-observation', summary: 'Fixture contrôlée du workflow' }], findings: ctx.snapshot.files.find(f => f.path === 'index.html')?.content === 'cassé' ? [{ id: 'copy', title: 'Message absent', description: 'Fixture', recommendation: 'Expliquer', confidence: 'confirmed', severity: 'minor', evidenceIds: ['e'] }] : [] }));
  const plan = PlanSchema.parse({ projectRoot: root, outputDir: join(root,'.labo-ux'), confirmed: true, mode: 'debug', permissions: { codeModification: true }, targets: [{ id: 'web', kind: 'web' }] });
  const engine = new AuditEngine([check],plan.outputDir);
  async function run(p: Plan) { const state=await engine.create(p); await engine.execute(state.id); return state.id; }
  try {
    const pending=await engine.create(plan);await expect(debuggingPlan(engine.store,pending.id)).rejects.toThrow('audit terminé');
    const before=await run(plan);
    expect(await readFile(source,'utf8')).toBe('cassé');
    const brief=await debuggingPlan(engine.store,before);expect(brief.phase).toBe('awaiting-agent-corrections');
    await expect(finishDebugging(engine.store,before,before,[{file:'index.html',summary:'Texte ajouté'}])).rejects.toThrow('nouvel audit');
    const afterPlan=PlanSchema.parse({...plan,mode:'audit',permissions:{...plan.permissions,codeModification:false}});
    const unchanged=await run(afterPlan);
    await expect(finishDebugging(engine.store,before,unchanged,[{file:'index.html',summary:'Fausse correction'}])).rejects.toThrow('sources auditées sont identiques');
    // Simulate the host agent's edit on this disposable test fixture, never Traverse.
    await writeFile(source,'message explicite');
    const after=await run(afterPlan);
    const completed=await finishDebugging(engine.store,before,after,[{file:'index.html',summary:'Message explicite ajouté par l’agent simulé'}]);
    expect(completed.comparison[0]?.resolvedFindings).toEqual(['copy']);
    expect(completed.unresolvedFindings).toEqual([]);expect(completed.phase).toBe('verification-completed');
    await expect(debuggingPlan(engine.store,after)).rejects.toThrow('lecture seule');
    await expect(finishDebugging(engine.store,before,after,[{file:'../secret',summary:'hors périmètre'}])).rejects.toThrow();
    const changedProtocol=await run(PlanSchema.parse({...afterPlan,objective:'Un autre objectif'}));
    await expect(finishDebugging(engine.store,before,changedProtocol,[{file:'index.html',summary:'Texte'}])).rejects.toThrow('protocole a changé');
    const report=await readReport(engine.store,before);
    expect(summarize(report).mode).toBe('debug');
    expect(html(report)).toContain('audit initial avant corrections');
  } finally { await rm(root,{recursive:true,force:true}); }
});
