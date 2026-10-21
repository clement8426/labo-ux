import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url)),folder=join(root,'.labo-ux/self-test');
await mkdir(folder,{recursive:true});
const project=await mkdtemp(join(folder,'fixture-')),html=await readFile(join(root,'fixtures/web-showcase/index.html'),'utf8');
await writeFile(join(project,'index.html'),html);await writeFile(join(project,'events.json'),await readFile(join(root,'fixtures/web-showcase/events.json')));
const server=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
try{
  const port=server.address().port,raw=JSON.parse(await readFile(join(root,'fixtures/web-showcase/audit.json'),'utf8'));
  raw.mode='audit';raw.projectRoot=project;raw.outputDir=join(folder,'runs');raw.targets[0].baseUrl=`http://127.0.0.1:${port}`;
  raw.permissions.codeModification=false;raw.timeoutMs=180000;
  raw.journeys[0].steps.splice(0,0,{action:'checkpoint'});
  const config=join(project,'audit.json');await writeFile(config,JSON.stringify(raw,null,2));
  const {stdout}=await promisify(execFile)(process.execPath,[resolve(root,'dist/packages/cli/src/index.js'),'run','--config',config],{cwd:root,windowsHide:true,timeout:240000,maxBuffer:15_000_000});
  const run=JSON.parse(stdout),reportPath=join(raw.outputDir,run.state.id,'report.html'),report=JSON.parse(await readFile(join(raw.outputDir,run.state.id,'report.json'),'utf8'));
  assert.equal(report.results.some(r=>['error','timed-out','cancelled'].includes(r.executionStatus)),false,'Aucun outil ne doit tomber en panne');
  for(const id of['a11y.scan-screen','a11y.scan-journey-states','friction.run-journey','performance.inspect-resources','performance.measure-web-load','behavior.compute-funnel'])assert.equal(report.results.find(r=>r.nodeId===id)?.executionStatus,'completed',`${id} réellement exécuté`);
  assert.ok(report.results.find(r=>r.nodeId==='a11y.scan-screen').findings.some(f=>f.id==='image-alt'),'Image volontairement sans alternative détectée');
  assert.equal(report.results.find(r=>r.nodeId==='friction.run-journey').findings.length,0,'Confirmation fictive atteinte');
  assert.equal(await readFile(join(project,'index.html'),'utf8'),html,'Code de la fixture inchangé');
  const result={status:'passed',testedAt:new Date().toISOString(),runId:run.state.id,outputDir:raw.outputDir,report:reportPath,mode:'audit',codeModified:false};
  await writeFile(join(folder,'latest.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await new Promise(done=>server.close(done));}
