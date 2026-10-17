import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { posix, resolve, relative, isAbsolute } from 'node:path';
import { TargetSchema, type Target, type Capability, type Plan, type Snapshot } from '../../contracts/src/index.js';
import { readSnapshot } from '../../adapters/source/src/index.js';
import { readRemoteSnapshot } from '../../adapters/ssh/src/index.js';

export function assertTargetRoots(plan: Plan): void {
  for (const target of plan.targets) {
    const rel = relative(resolve(plan.projectRoot), resolve(plan.projectRoot, target.root));
    if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) throw new Error(`La cible sort du projet : ${target.root}`);
  }
}
export async function snapshotForPlan(plan: Plan): Promise<Snapshot> {
  assertTargetRoots(plan);
  return plan.source.mode === 'ssh' ? readRemoteSnapshot(plan.source) : readSnapshot(plan.projectRoot, [resolve(plan.outputDir)]);
}
export function discoverTargets(snapshot: Snapshot): Target[] {
  const found = new Map<string, Target>();
  const add = (root: string, kind: Target['kind'], technologies: string[]) => {
    const key = `${root}:${kind}`, previous = found.get(key);
    found.set(key, TargetSchema.parse({ id: `${root === '.' ? 'app' : root.replace(/[^\w-]/g, '-')}-${kind}`, root, kind, technology: [...new Set([...(previous?.technology ?? []), ...technologies])] }));
  };
  for (const f of snapshot.files) {
    const root = posix.dirname(f.path);
    if (posix.basename(f.path) === 'package.json') {
      try {
        const pkg = JSON.parse(f.content), deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const web = ['react', 'next', 'vue', 'nuxt', '@angular/core', 'svelte', 'astro'].filter(t => t in deps);
        if ('react-native' in deps || 'expo' in deps) { add(root, 'android', ['react-native', ...('expo' in deps ? ['expo'] : [])]); add(root, 'ios', ['react-native']); }
        if ('react-native-web' in deps) add(root, 'web', ['react-native-web']);
        if (web.length && !('react-native' in deps) || 'next' in deps) add(root, 'web', web);
      } catch { /* An invalid manifest does not prevent other detection. */ }
    }
    if (f.path.endsWith('pubspec.yaml') && /sdk:\s*flutter/.test(f.content)) { add(root, 'android', ['flutter']); add(root, 'ios', ['flutter']); }
    if (/\.html?$/.test(f.path) && !snapshot.files.some(x => x.path === posix.join(root, 'package.json'))) add(root, 'web', ['html']);
    if (f.path.endsWith('AndroidManifest.xml')) add(root, 'android', ['android-native']);
    if (/\.swift$/.test(f.path)) add(root, 'ios', ['swift']);
  }
  if (!found.size) add('.', 'web', ['unknown']);
  return [...found.values()];
}
const require = createRequire(import.meta.url);
function packageVersion(name: string): string | undefined {
  try { return require(`${name}/package.json`).version; } catch { try { require.resolve(name); return 'installed'; } catch { return undefined; } }
}
export async function capabilitiesFor(target: Target, plan: Plan, snapshot: Snapshot): Promise<Capability[]> {
  const cap: Capability[] = [];
  const set = (id: string, available: boolean, reason: string, version?: string) => cap.push({ id, available, reason, version });
  set('source.read', snapshot.files.length > 0, snapshot.files.length ? `${snapshot.files.length} fichiers accessibles` : 'Aucun fichier analysable');
  set('source.styles', snapshot.files.some(f => /\.(html?|css|scss|tsx?|jsx?|vue|svelte|dart|swift|kt|xml)$/.test(f.path)), 'Analyse statique générique, sans résolution des styles');
  set('source.strings', snapshot.files.length > 0, 'Chaînes présentes dans le code, usage réel non confirmé');
  let browser = false, browserReason = 'Playwright ou Chromium absent', browserVersion: string | undefined;
  if (['web', 'webview'].includes(target.kind) && plan.permissions.runtime && target.baseUrl) {
    try { const optionalModule = 'playwright'; const { chromium } = await import(optionalModule); await access(chromium.executablePath()); browser = true; browserVersion = packageVersion('playwright'); browserReason = 'Chromium installé ; disponibilité réelle vérifiée par chaque contrôle'; } catch { /* Optional runtime. */ }
  } else browserReason = !plan.permissions.runtime ? 'Exécution dynamique non autorisée dans le plan' : 'Adresse de test absente ou cible native';
  set('runtime.browser', browser, browserReason, browserVersion);
  for (const id of ['runtime.screenshot', 'runtime.semantics', 'runtime.network-control']) set(id, browser, browserReason);
  for (const [id, pkg] of [['audit.axe', '@axe-core/playwright'], ['audit.lighthouse', 'lighthouse']] as const) {
    const v = packageVersion(pkg); set(id, browser && !!v, v ? browserReason : `${pkg} absent`, v);
  }
  set('behavior.events', !!plan.behavior, plan.behavior ? 'Import configuré ; validité vérifiée par le nœud' : 'Données absentes : fournir un export JSON/CSV et les étapes du tunnel');
  for (const id of ['runtime.android', 'runtime.ios', 'audit.native-accessibility', 'performance.native']) set(id, false, 'Adaptateur natif non livré : détection et analyse du code seulement');
  return cap;
}
export const adapterCatalog = [
  { id: 'local-source', status: 'implemented', scope: 'Lecture bornée de sources locales' },
  { id: 'ssh-source', status: 'experimental', scope: 'Collecte en lecture seule, SSH POSIX et Node distant ; aucun worker de compilation ou tunnel automatique' },
  { id: 'web', status: 'implemented', scope: 'Chromium, Playwright, axe-core et Lighthouse facultatifs' },
  ...['android', 'ios', 'react-native', 'flutter'].map(id => ({ id, status: 'source-only', scope: 'Détection heuristique, analyse statique générique ; exécution native non livrée' })),
  { id: 'behavior', status: 'implemented', scope: 'JSON/CSV normalisés, sessions, tunnel ordonné et fenêtre temporelle' }
];
