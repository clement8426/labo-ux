import { sourceChecks } from './source.js';
import { define } from './helpers.js';
import { isolatedWebTask } from '../../adapters/web/src/index.js';
export const checks = [
  ...sourceChecks,
  ...([
    ['design.collect-styles', 'design-system', 'styles', ['runtime.browser']],
    ['a11y.scan-screen', 'accessibility', 'axe', ['runtime.browser', 'audit.axe']],
    ['copy.collect-controls', 'microcopy', 'copy', ['runtime.browser']],
    ['friction.run-journey', 'friction', 'journeys', ['runtime.browser']],
    ['performance.measure-web-load', 'performance', 'lighthouse', ['runtime.browser', 'audit.lighthouse']]
  ] as const).map(([id, block, task, required]) => define(id, block, ctx => isolatedWebTask(task, ctx), {
    supportedTargets: ['web', 'webview'], requiredCapabilities: [...required],
    resourceRequirements: task === 'lighthouse' ? ['exclusive'] : ['browser'],
    retryPolicy: { maxAttempts: 1, transientErrors: [], idempotent: task !== 'journeys' }, timeoutMs: task === 'lighthouse' ? 120000 : 60000
  })),
  define('a11y.native-audit', 'accessibility', async () => { throw new Error('Audit natif non livré ; aucune mesure produite'); }, { supportedTargets: ['android', 'ios'], requiredCapabilities: ['audit.native-accessibility'], resourceRequirements: ['device'] }),
  define('performance.measure-startup', 'performance', async () => { throw new Error('Mesure native non livrée ; aucune mesure produite'); }, { supportedTargets: ['android', 'ios'], requiredCapabilities: ['performance.native'], resourceRequirements: ['device', 'exclusive'] })
];
