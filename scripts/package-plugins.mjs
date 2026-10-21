import { mkdir, cp, readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url)), check = process.argv.includes('--check');
const engine = join(root, 'dist/packages/mcp-server/src/index.js');
const { version } = JSON.parse(await readFile(join(root,'package.json'),'utf8'));
await access(engine);
const skill = await readFile(join(root, 'skills/ux-audit/SKILL.md'), 'utf8');
if (!/^---\s*\nname: ux-audit\n/m.test(skill) || !skill.includes('description:')) throw new Error('Skill commun invalide');
for (const host of ['codex', 'claude']) {
  const plugin = resolve(root, 'plugins', host), manifest = join(plugin, `.${host}-plugin`, 'plugin.json');
  if (!check) {
    await mkdir(join(plugin, `.${host}-plugin`), { recursive: true });
    await mkdir(join(plugin, 'skills'), { recursive: true });
    await cp(join(root, 'skills/ux-audit'), join(plugin, 'skills/ux-audit'), { recursive: true });
    await writeFile(manifest, JSON.stringify({ name: 'labo-ux', version, description: 'Audit UX modulaire avec couverture explicite', skills: './skills/', mcpServers: './.mcp.json' }, null, 2) + '\n');
    // Local distributions reference one installed engine. Regenerate after relocation.
    await writeFile(join(plugin, '.mcp.json'), JSON.stringify({ mcpServers: { 'labo-ux': { command: process.execPath, args: [engine] } } }, null, 2) + '\n');
  }
  const metadata = JSON.parse(await readFile(manifest, 'utf8'));
  if (metadata.version !== version) throw new Error('Version du plugin désynchronisée : régénérer les distributions');
  for (const path of [metadata.skills, metadata.mcpServers]) if (!path.startsWith('./') || path.includes('..')) throw new Error('Chemin de plugin invalide');
  if (await readFile(join(plugin, 'skills/ux-audit/SKILL.md'), 'utf8') !== skill) throw new Error('Skill de distribution désynchronisé');
  const config = JSON.parse(await readFile(join(plugin, '.mcp.json'), 'utf8'));
  if (config.mcpServers['labo-ux'].args[0] !== engine) throw new Error('Moteur déplacé : régénérer les distributions');
  process.stdout.write(`${host} : ${check ? 'validé' : 'préparé'}\n`);
}
