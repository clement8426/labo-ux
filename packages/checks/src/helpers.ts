import { PlanSchema, OutputSchema, targetKinds, type Check, type Output, type Context } from '../../contracts/src/index.js';
export const output = (data: Partial<Output> = {}): Output => OutputSchema.parse(data);
export function define(id: string, block: Check['block'], run: (ctx: Context) => Promise<Output>, options: Partial<Check> = {}): Check {
  return { id, version: '1.0.0', block, supportedTargets: [...targetKinds], requiredCapabilities: ['source.read'],
    requiredDependencies: [], optionalDependencies: [], timeoutMs: 60000,
    retryPolicy: { maxAttempts: 1, transientErrors: [], idempotent: true }, resourceRequirements: [],
    inputSchema: PlanSchema, outputSchema: OutputSchema, run, ...options };
}
