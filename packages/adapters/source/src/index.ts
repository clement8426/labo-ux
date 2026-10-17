import { readdir, readFile, lstat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, sep } from 'node:path';
import type { Snapshot } from '../../../contracts/src/index.js';

const ignored = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.labo-ux', 'Pods', '.dart_tool', '.gradle', 'coverage']);
const supported = /\.(?:[cm]?[jt]sx?|html?|css|scss|sass|less|vue|svelte|astro|json|ya?ml|dart|swift|kt|java|xml|strings|arb|gradle)$/i;
export async function readSnapshot(root: string, exclusions: string[] = []): Promise<Snapshot> {
  const base = await realpath(root);
  const excluded = exclusions.map(p => resolve(p));
  const files: Snapshot['files'] = [], limitations: string[] = [];
  let bytes = 0, visited = 0;
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const item of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (++visited > 30000 || files.length >= 3000 || bytes > 20_000_000) { limitations.push('Analyse bornée : plafond de fichiers ou de volume atteint.'); return; }
      const path = resolve(dir, item.name);
      if (item.isSymbolicLink() || ignored.has(item.name) || item.name.startsWith('.env') || excluded.some(p => path === p || path.startsWith(p + sep))) continue;
      if (item.isDirectory()) { await walk(path); continue; }
      if (!supported.test(item.name) || /(?:lock|credentials|secrets)\./i.test(item.name) || item.name === 'package-lock.json') continue;
      try {
        const info = await lstat(path);
        if (info.size > 512_000) { limitations.push(`Fichier volumineux ignoré : ${relative(base, path)}`); continue; }
        const content = await readFile(path, 'utf8'); bytes += info.size;
        files.push({ path: relative(base, path).split(sep).join('/'), content });
      } catch (e) { limitations.push(`Lecture impossible : ${relative(base, path)} (${String(e)})`); }
    }
  };
  await walk(base);
  return normalizeSnapshot({ files, limitations, fingerprint: '' });
}
export function normalizeSnapshot(snapshot: Snapshot): Snapshot {
  snapshot.files.sort((a, b) => a.path.localeCompare(b.path));
  snapshot.fingerprint = createHash('sha256').update(JSON.stringify(snapshot.files)).digest('hex');
  snapshot.limitations = [...new Set(snapshot.limitations)];
  return snapshot;
}
export function targetSnapshot(snapshot: Snapshot, root: string): Snapshot {
  const prefix = root.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
  if (!prefix || prefix === '.') return snapshot;
  return normalizeSnapshot({ files: snapshot.files.filter(f => f.path.startsWith(prefix + '/')).map(f => ({ ...f, path: f.path.slice(prefix.length + 1) })), limitations: snapshot.limitations, fingerprint: '' });
}
