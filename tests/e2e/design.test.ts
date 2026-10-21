import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { PlanSchema } from '../../packages/contracts/src/index.js';
// Le worker isolé est réellement exécuté depuis la distribution compilée, comme le CLI/MCP.
const { checks, readReport, Store, debuggingPlan, finishDebugging } = await import(pathToFileURL(resolve('dist/packages/core/src/service.js')).href) as typeof import('../../packages/core/src/service.js');
const { AuditEngine } = await import(pathToFileURL(resolve('dist/packages/core/src/index.js')).href) as typeof import('../../packages/core/src/index.js');

let available = false; try { await access(chromium.executablePath()); available = true; } catch { /* Skip explicite sans Chromium. */ }
it.skipIf(!available)('détecte les liens et espaces incohérents, transmet au débogage et vérifie les corrections réelles', async () => {
  const root=await mkdtemp(join(tmpdir(),'labo-design-')), source=join(root,'index.html'), outputDir=join(root,'.labo-ux');
  const fixture=(fixed:boolean)=>`<!doctype html><html lang="fr"><title>Sorties fictives</title><style>
    body{font:16px Arial}button,a{font:inherit}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}article{padding:16px}.inside{padding-top:18px}h3{margin-bottom:20px}
    .go,.next{display:inline-block;background:green;color:white;border:0;border-radius:4px;padding:12px 16px}
    ${fixed?'':'.grid article:nth-child(2) .go{padding:4px;border-radius:30px;background:navy}.grid article:nth-child(3) .go{padding:2px;background:none;color:green}.grid article:nth-child(2) .inside{padding-top:2px}.grid article:nth-child(3) h3{margin-bottom:44px}body.second .next{padding:2px;background:navy}'}
    @media(max-width:600px){.grid{grid-template-columns:1fr}.go{font-size:18px}}
    </style><main><h1>Choisir une activité</h1><div class="grid">${['Une promenade','Un atelier','Un pique-nique'].map((label,i)=>`<article><div class="inside"><h3>${label}</h3><p>Une sortie fictive</p><a class="go" href="/offre/${i}">Découvrir</a></div></article>`).join('')}</div><a class="next" data-next href="/next">Continuer</a><button>Supprimer</button><input value="PRIVATE_SENTINEL" aria-label="Note"></main></html>`;
  await writeFile(source,fixture(false));
  const server=createServer(async(req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');if(req.url==='/missing'){res.writeHead(404);res.end('Absent');return;}const html=await readFile(source,'utf8');res.end(req.url==='/next'?html.replace('<main>','<body class="second"><main>'):html);});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as {port:number}).port;
  const plan=PlanSchema.parse({projectRoot:root,outputDir,mode:'debug',confirmed:true,permissions:{runtime:true,codeModification:true},targets:[{id:'web',kind:'web',baseUrl:`http://127.0.0.1:${port}`}],checks:['design.collect-styles'],design:{pages:['/next'],groups:[{id:'continue',selector:'[data-next]'}]},timeoutMs:60000});
  const engine=new AuditEngine(checks,outputDir);
  const run=async()=>{const state=await engine.create(plan);await engine.execute(state.id);return state.id;};
  try {
    const before=await run(), report=await readReport(new Store(outputDir),before), result=report.results[0]!;
    expect(result.executionStatus,result.error).toBe('completed');
    expect(result.findings.some(f=>f.id.startsWith('action-'))).toBe(true);
    expect(result.findings.some(f=>f.id.startsWith('spacing-'))).toBe(true);
    expect(result.measurements.find(m=>m.name==='design.views')?.value).toBe(4);
    const proof=result.evidence.find(e=>e.id==='styles')!;
    const inventory=await readFile(join(outputDir,before,'evidence',proof.artifact!),'utf8');
    expect(inventory).toContain('"tag": "A"');expect(inventory).not.toContain('PRIVATE_SENTINEL');
    const brief=await debuggingPlan(engine.store,before);expect(brief.findings.some(f=>f.nodeId==='design.collect-styles')).toBe(true);
    await writeFile(source,fixture(false)+'<!-- modification sans correction -->');
    const unchanged=await run();
    const pending=await finishDebugging(engine.store,before,unchanged,[{file:'index.html',summary:'Commentaire sans correction des styles'}]);
    expect(pending.completionStatus).toBe('corrections-incomplete');expect(pending.designVerification.status).toBe('differences-remain');
    await writeFile(source,fixture(true));
    const after=await run(), corrected=await readReport(engine.store,after);
    expect(corrected.results[0]?.findings).toEqual([]);
    const finished=await finishDebugging(engine.store,before,after,[{file:'index.html',summary:'Composants et espacements harmonisés'}]);
    expect(finished.designVerification.status).toBe('no-differences-detected-in-scope');
    expect(finished.completionStatus).toBe('no-remaining-detected-findings');
    expect(finished.comparison[0]?.resolvedFindings.length).toBeGreaterThan(0);
    await expect(finishDebugging(engine.store,before,await (async()=>{const state=await engine.create(PlanSchema.parse({...plan,design:{...plan.design,pages:[]}}));await engine.execute(state.id);return state.id;})(),[{file:'index.html',summary:'Périmètre réduit'}])).rejects.toThrow('protocole a changé');
    const unavailable=await engine.create(PlanSchema.parse({...plan,design:{...plan.design,pages:['/missing']}}));await engine.execute(unavailable.id);
    const partial=await readReport(engine.store,unavailable.id);
    expect(partial.results[0]?.executionStatus).toBe('partial');
    expect(partial.results[0]?.limitations.some(limit=>limit.includes('404'))).toBe(true);
    expect(partial.results[0]?.limitations.some(limit=>limit.includes('groupe non validé'))).toBe(true);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
},120000);
