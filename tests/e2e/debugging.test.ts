import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { access, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from 'playwright';
let available=false;try{await access(chromium.executablePath());available=true;}catch{/* Browser prerequisite. */}
it.skipIf(!available)('enchaîne MCP debug, correction par l’hôte sur fixture jetable, audit CLI et compte rendu vérifié',async()=>{
  const root=await mkdtemp(join(tmpdir(),'labo-debug-e2e-')),source=join(root,'index.html'),outputDir=join(root,'.labo-ux');
  const broken='<!doctype html><html lang="fr"><title>Fixture</title><main><h1>Décor</h1><img src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22/%3E"></main></html>';
  await writeFile(source,broken);
  const server=createServer(async(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(await readFile(source));});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port;
  const client=new Client({name:'debugging-e2e',version:'1'});
  const transport=new StdioClientTransport({command:process.execPath,args:[resolve('dist/packages/mcp-server/src/index.js')],stderr:'pipe'});
  const call=async(name:string,args:any)=>{const result:any=await client.callTool({name,arguments:args});expect(result.isError).not.toBe(true);return JSON.parse(result.content[0].text);};
  try{
    await client.connect(transport);
    const plan={projectRoot:root,outputDir,mode:'debug',confirmed:true,targets:[{id:'web',kind:'web',baseUrl:`http://127.0.0.1:${port}`}],checks:['a11y.scan-screen'],permissions:{runtime:true,codeModification:true}};
    const started=await call('start_audit',{plan});expect(started.phase).toBe('initial-audit');expect(started.codeModifiedByEngine).toBe(false);
    let status;for(let i=0;i<200;i++){status=await call('get_audit_status',{runId:started.runId,outputDir});if(status.state.status!=='running')break;await new Promise(r=>setTimeout(r,100));}
    expect(status.state.status).toBe('completed');
    const brief=await call('get_debugging_plan',{runId:started.runId,outputDir});expect(brief.findings.some((f:any)=>f.id==='image-alt')).toBe(true);
    expect(await readFile(source,'utf8')).toBe(broken);
    // The test harness plays the external agent; the engine never edits this file.
    await writeFile(source,broken.replace('<img src=','<img alt="" src='));
    const afterPlan={...plan,mode:'audit',permissions:{runtime:true,codeModification:false}};
    const config=join(outputDir,'after-plan.json');await writeFile(config,JSON.stringify(afterPlan));
    const {stdout}=await promisify(execFile)(process.execPath,[resolve('dist/packages/cli/src/index.js'),'run','--config',config],{timeout:60000});
    const after=JSON.parse(stdout);expect(after.workflow.codeModifiedByEngine).toBe(false);
    const result=await call('finish_debugging',{before:started.runId,after:after.state.id,outputDir,changes:[{file:'index.html',summary:'Alternative vide sur l’image décorative de la fixture'}]});
    expect(result.comparison[0].resolvedFindings).toContain('image-alt');expect(result.toolFailures).toEqual([]);await access(result.summaryFile);
  }finally{await client.close();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});}
},90000);
