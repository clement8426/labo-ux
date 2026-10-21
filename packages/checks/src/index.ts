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
    ['a11y.scan-journey-states', 'accessibility', 'axe-states', ['runtime.browser', 'audit.axe']],
    ['performance.inspect-resources', 'performance', 'resources', ['runtime.browser']],
    ['technical.inspect-network', 'technical', 'network', ['runtime.browser']],
    ['technical.measure-memory', 'technical', 'memory', ['runtime.browser']],
    ['technical.inspect-security', 'technical', 'security', ['runtime.browser']],
    ['performance.measure-web-load', 'performance', 'lighthouse', ['runtime.browser', 'audit.lighthouse']]
  ] as const).map(([id, block, task, required]) => define(id, block, ctx => isolatedWebTask(task, ctx), {
    supportedTargets: ['web', 'webview'], requiredCapabilities: [...required],
    resourceRequirements: task === 'lighthouse' ? ['exclusive'] : ['browser'],
    retryPolicy: { maxAttempts: task === 'lighthouse' ? 2 : 1, transientErrors: task === 'lighthouse' ? ['fetch browser webSocket URL', 'ECONNREFUSED'] : [], idempotent: !['journeys', 'axe-states'].includes(task) },
    timeoutMs: task === 'axe-states' || task === 'styles' ? 180000 : task === 'lighthouse' ? 120000 : 60000,
    version: task === 'lighthouse' ? '1.2.0' : task === 'styles' ? '2.0.0' : '1.0.0'
  })),
  define('a11y.native-audit', 'accessibility', async () => { throw new Error('Audit natif non livré ; aucune mesure produite'); }, { supportedTargets: ['android', 'ios'], requiredCapabilities: ['audit.native-accessibility'], resourceRequirements: ['device'] }),
  define('performance.measure-startup', 'performance', async () => { throw new Error('Mesure native non livrée ; aucune mesure produite'); }, { supportedTargets: ['android', 'ios'], requiredCapabilities: ['performance.native'], resourceRequirements: ['device', 'exclusive'] })
];
