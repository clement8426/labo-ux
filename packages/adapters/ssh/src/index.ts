import { command } from '../../local/src/index.js';
import { normalizeSnapshot } from '../../source/src/index.js';
import type { Plan, Snapshot } from '../../../contracts/src/index.js';

// Fixed, read-only collector; project contents are data and never interpreted as commands.
const collector = `const fs=require('fs'),p=require('path');const root=fs.realpathSync(process.argv[1]),files=[],limitations=[];let bytes=0,count=0;const skip=new Set(['node_modules','.git','dist','build','.next','.nuxt','.labo-ux','Pods','.dart_tool','.gradle','coverage']);function walk(dir){for(const n of fs.readdirSync(dir).sort()){if(++count>30000||files.length>=3000||bytes>20000000){limitations.push('Plafond de collecte SSH atteint');return}if(skip.has(n)||n.startsWith('.env')||n==='package-lock.json'||/(?:lock|credentials|secrets)\\./i.test(n))continue;const f=p.join(dir,n),s=fs.lstatSync(f);if(s.isSymbolicLink())continue;if(s.isDirectory()){walk(f);continue}if(!/\\.(?:[cm]?[jt]sx?|html?|css|scss|sass|less|vue|svelte|astro|json|ya?ml|dart|swift|kt|java|xml|strings|arb|gradle)$/i.test(n))continue;if(s.size>512000){limitations.push('Fichier volumineux ignoré : '+n);continue}try{files.push({path:p.relative(root,f).split(p.sep).join('/'),content:fs.readFileSync(f,'utf8')});bytes+=s.size}catch(e){limitations.push(String(e))}}}walk(root);console.log(JSON.stringify({files,limitations,fingerprint:''}));`;
export function quotePosix(value: string): string { return "'" + value.replaceAll("'", "'\\''") + "'"; }
export async function readRemoteSnapshot(source: Extract<Plan['source'], { mode: 'ssh' }>): Promise<Snapshot> {
  const stdout = await command('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-p', String(source.port), source.host, `node -e ${quotePosix(collector)} ${quotePosix(source.remoteRoot)}`], { timeoutMs: 30000 });
  const data = JSON.parse(stdout);
  if (!Array.isArray(data.files) || !data.files.every((f: any) => typeof f.path === 'string' && typeof f.content === 'string' && !f.path.includes('..') && !f.path.startsWith('/')) || !Array.isArray(data.limitations)) throw new Error('Snapshot SSH invalide');
  return normalizeSnapshot(data);
}
