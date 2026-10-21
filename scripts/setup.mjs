import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(import.meta.url);
const stateFile=join(root,'.labo-ux/setup.json');
if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node.js 22 ou supérieur requis. L’agent doit préparer un runtime compatible avant ce script.');
await mkdir(dirname(stateFile),{recursive:true});
const state={status:'running',startedAt:new Date().toISOString(),node:process.version,platform:process.platform,steps:[]};
await writeFile(stateFile,JSON.stringify(state,null,2));
function run(command,args){return new Promise((done,reject)=>{const p=spawn(command,args,{cwd:root,stdio:'inherit',windowsHide:true});p.once('error',reject);p.once('exit',code=>code===0?done():reject(new Error(`${command} ${args.join(' ')} : code ${code}`)));});}
function npmCli(){
  if(process.env.npm_execpath&&/npm-cli\.(?:js|cjs)$/.test(process.env.npm_execpath))return process.env.npm_execpath;
  for(const candidate of[join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),join(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')]){try{return require.resolve(candidate);}catch{}}
  return require.resolve('npm/bin/npm-cli.js');
}
async function step(name,fn){process.stderr.write(`\nLabo UX — ${name}\n`);await fn();state.steps.push({name,status:'passed',at:new Date().toISOString()});await writeFile(stateFile,JSON.stringify(state,null,2));}
try{
  const fingerprint=createHash('sha256').update(await readFile(join(root,'package.json'))).update(await readFile(join(root,'package-lock.json'))).update(process.versions.node.split('.')[0]).update(process.platform).update(process.arch).digest('hex');
  let previous;try{previous=JSON.parse(await readFile(join(root,'.labo-ux/dependencies.json'),'utf8'));}catch{}
  let installed=false;
  if(previous?.fingerprint===fingerprint){try{await access(join(root,'node_modules/typescript/bin/tsc'));for(const name of['playwright','@axe-core/playwright','lighthouse','@modelcontextprotocol/sdk'])require.resolve(name);installed=true;}catch{}}
  await step('Dépendances verrouillées',async()=>{if(!installed)await run(process.execPath,[npmCli(),'ci','--include=optional','--no-audit','--no-fund']);else process.stderr.write('Installation compatible réutilisée.\n');await writeFile(join(root,'.labo-ux/dependencies.json'),JSON.stringify({fingerprint},null,2));});
  await step('Compilation du moteur',()=>run(process.execPath,[require.resolve('typescript/bin/tsc'),'-p','tsconfig.json']));
  await step('Navigateur de test',async()=>{const {chromium}=await import('playwright');try{await access(chromium.executablePath());}catch{await run(process.execPath,[join(dirname(require.resolve('playwright/package.json')),'cli.js'),'install','chromium']);}});
  await step('Distributions locales',()=>run(process.execPath,[join(root,'scripts/package-plugins.mjs')]));
  await step('Audit réel de vérification',()=>run(process.execPath,[join(root,'scripts/self-test.mjs')]));
  state.status='passed';state.endedAt=new Date().toISOString();const verification=JSON.parse(await readFile(join(root,'.labo-ux/self-test/latest.json'),'utf8'));state.verification=verification;
  await writeFile(stateFile,JSON.stringify(state,null,2));process.stdout.write(JSON.stringify({status:state.status,root,verification,stateFile},null,2)+'\n');
}catch(error){state.status='failed';state.error=String(error);state.endedAt=new Date().toISOString();await writeFile(stateFile,JSON.stringify(state,null,2));process.stderr.write(`Installation non validée : ${state.error}\n`);process.exitCode=1;}
