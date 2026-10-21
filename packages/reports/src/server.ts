import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { exportClientPdf } from './pdf.js';
export async function serveReport(directory: string, port = 4193) {
  const root = await realpath(directory);
  const contentTypes: Record<string,string> = { '.html':'text/html; charset=utf-8', '.md':'text/plain; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.pdf':'application/pdf', '.zip':'application/zip' };
  const server=createServer(async(req,res)=>{
    if (!['GET','HEAD'].includes(req.method ?? '')) {res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
    let pathname: string;
    try { pathname=decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); } catch {res.writeHead(400);res.end();return;}
    const name=pathname==='/'?'report.html':pathname.slice(1);
    if (name.split(/[\\/]/).includes('..')) {res.writeHead(404);res.end();return;}
    if (!['report.html','report.md','report.json','client.html','client.pdf','debugging-result.md','debugging-result.json'].includes(name)&&!name.startsWith('evidence/')) {res.writeHead(404);res.end();return;}
    if (name === 'client.pdf' && req.method === 'GET') {
      try { await exportClientPdf(root); }
      catch { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('Export PDF indisponible. Vérifiez que Playwright et Chromium sont installés ; le rapport HTML et les preuves restent disponibles.'); return; }
    }
    try {
      const file=await realpath(resolve(root,name));
      const allowedRoot=name.startsWith('evidence/')?await realpath(resolve(root,'evidence')):root;
      const rel=relative(allowedRoot,file);
      if (rel.startsWith('..')||isAbsolute(rel)||!contentTypes[extname(file)]) {res.writeHead(404);res.end();return;}
      const body=await readFile(file);res.writeHead(200,{'Content-Type':contentTypes[extname(file)]!,'Content-Length':body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(name==='client.pdf'?{'Content-Disposition':'attachment; filename="audit-labo-ux.pdf"'}:{})});res.end(req.method==='HEAD'?undefined:body);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise<void>((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);done();});});
  return server;
}
