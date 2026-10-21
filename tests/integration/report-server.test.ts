import { it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveReport } from '../../packages/reports/src/server.js';
it('expose le rapport et ses preuves en lecture seule sur loopback, sans ouvrir le dossier complet', async () => {
  const root=await mkdtemp(join(tmpdir(),'labo-report-'));
  await mkdir(join(root,'evidence'));await writeFile(join(root,'report.html'),'<h1>Rapport</h1>');await writeFile(join(root,'evidence','sample.json'),'{}');await writeFile(join(root,'run.json'),'privé');
  const server=await serveReport(root,0), address=server.address() as {port:number;address:string};const url=`http://127.0.0.1:${address.port}`;
  try {
    expect(address.address).toBe('127.0.0.1');
    expect(await (await fetch(url)).text()).toContain('Rapport');expect((await fetch(`${url}/evidence/sample.json`)).status).toBe(200);
    expect((await fetch(`${url}/run.json`)).status).toBe(404);expect((await fetch(`${url}/evidence/%2e%2e%2frun.json`)).status).toBe(404);
    expect((await fetch(url,{method:'POST'})).status).toBe(405);expect((await fetch(url,{method:'HEAD'})).headers.get('content-type')).toContain('text/html');
  } finally {await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});}
});
