import { z } from 'zod';

export const schemaVersion = '1' as const;
export const kitVersion = '0.2.0' as const;
export const blocks = ['design-system', 'friction', 'accessibility', 'behavior', 'microcopy', 'performance'] as const;
export const targetKinds = ['web', 'android', 'ios', 'webview'] as const;
export const executionStatuses = ['completed', 'partial', 'error', 'timed-out', 'skipped', 'not-applicable', 'cancelled'] as const;
export const evidenceKinds = ['measurement', 'runtime-observation', 'source-analysis', 'ai-assessment'] as const;
export const LocatorSchema = z.object({ testId: z.string().optional(), role: z.string().optional(), name: z.string().optional(), text: z.string().optional() })
  .refine(v => [v.testId, v.role, v.text].filter(Boolean).length === 1, 'Un seul sélecteur stable : testId, role ou text');
export const ActionSchema = z.object({
  action: z.enum(['open-target', 'activate', 'enter-text', 'select', 'scroll', 'go-back', 'expect-visible', 'expect-text', 'expect-state', 'checkpoint', 'open-url', 'launch-app', 'open-deep-link', 'set-orientation', 'background-app', 'foreground-app', 'handle-permission']),
  locator: LocatorSchema.optional(), value: z.string().optional(), path: z.string().optional(), expected: z.string().optional()
}).superRefine((v, ctx) => {
  if (['activate', 'enter-text', 'select', 'expect-visible', 'expect-text', 'expect-state'].includes(v.action) && !v.locator)
    ctx.addIssue({ code: 'custom', message: 'Sélecteur requis' });
  if (['enter-text', 'select'].includes(v.action) && v.value === undefined) ctx.addIssue({ code: 'custom', message: 'Valeur requise' });
  if (v.action === 'expect-text' && v.expected === undefined) ctx.addIssue({ code: 'custom', message: 'Texte attendu requis' });
  if (v.action === 'expect-state' && !['enabled', 'disabled', 'checked', 'unchecked'].includes(v.expected ?? '')) ctx.addIssue({ code: 'custom', message: 'État attendu : enabled, disabled, checked ou unchecked' });
});
export const JourneySchema = z.object({
  id: z.string().regex(/^[\w.-]+$/), name: z.string().min(1), targetId: z.string(),
  preconditions: z.array(z.string()).min(1), expectedOutcome: z.string().min(1),
  mutatesData: z.boolean().default(false), steps: z.array(ActionSchema).min(1)
});
export const TargetSchema = z.object({
  id: z.string().regex(/^[\w.-]+$/), kind: z.enum(targetKinds), root: z.string().default('.'),
  technology: z.array(z.string()).default([]), baseUrl: z.string().url().optional(),
  appId: z.string().optional(), deviceId: z.string().optional(),
  buildProfile: z.enum(['debug', 'profile', 'release', 'unknown']).default('unknown'),
  platformMetadata: z.record(z.string(), z.string()).default({})
});
export const PlanSchema = z.object({
  schemaVersion: z.literal(schemaVersion).default(schemaVersion), projectRoot: z.string(),
  mode: z.enum(['audit', 'debug']).default('audit'),
  usage: z.enum(['showcase', 'content', 'ecommerce', 'saas', 'business-app', 'custom']).default('custom'),
  objective: z.string().default('Identifier les obstacles UX'), confirmed: z.boolean().default(false),
  targets: z.array(TargetSchema).min(1), blocks: z.array(z.enum(blocks)).default([...blocks]),
  checks: z.array(z.string()).optional(), journeys: z.array(JourneySchema).default([]),
  behavior: z.object({ file: z.string(), steps: z.array(z.string().min(1)).min(2).max(100), windowMs: z.number().positive().default(1800000) }).optional(),
  permissions: z.object({ runtime: z.boolean().default(false), dataMutation: z.boolean().default(false), codeModification: z.boolean().default(false) }).default({ runtime: false, dataMutation: false, codeModification: false }),
  concurrency: z.number().int().min(1).max(16).default(3), timeoutMs: z.number().int().min(10).max(600000).default(60000),
  outputDir: z.string().default('.labo-ux'),
  source: z.discriminatedUnion('mode', [z.object({ mode: z.literal('local') }), z.object({ mode: z.literal('ssh'), host: z.string().regex(/^[a-zA-Z0-9_.@-]+$/).refine(v => !v.startsWith('-')), remoteRoot: z.string().min(1), port: z.number().int().min(1).max(65535).default(22) })]).default({ mode: 'local' })
}).superRefine((v, ctx) => {
  if (v.mode === 'audit' && v.permissions.codeModification) ctx.addIssue({ code: 'custom', message: 'Le mode audit interdit la modification du code ; utiliser le mode debug pour autoriser les corrections.' });
  if (v.mode === 'debug' && !v.permissions.codeModification) ctx.addIssue({ code: 'custom', message: 'Le mode debug exige l’autorisation explicite permissions.codeModification: true.' });
  if (new Set(v.targets.map(t => t.id)).size !== v.targets.length) ctx.addIssue({ code: 'custom', message: 'Identifiants de cibles dupliqués' });
  if (new Set(v.journeys.map(j => j.id)).size !== v.journeys.length) ctx.addIssue({ code: 'custom', message: 'Identifiants de parcours dupliqués' });
  for (const j of v.journeys) if (!v.targets.some(t => t.id === j.targetId)) ctx.addIssue({ code: 'custom', message: `Cible du parcours inconnue : ${j.targetId}` });
});
export const EvidenceSchema = z.object({ id: z.string(), kind: z.enum(evidenceKinds), summary: z.string(), file: z.string().optional(), line: z.number().int().positive().optional(), artifact: z.string().optional() });
export const FindingSchema = z.object({ id: z.string(), severity: z.enum(['info', 'minor', 'major', 'critical']), title: z.string(), description: z.string(), recommendation: z.string(), evidenceIds: z.array(z.string()).min(1), confidence: z.enum(['confirmed', 'hypothesis']) });
export const MeasurementSchema = z.object({ name: z.string(), value: z.number().finite(), unit: z.string(), context: z.record(z.string(), z.string()).default({}) });
export const OutputSchema = z.object({
  executionStatus: z.enum(['completed', 'partial']).default('completed'), findings: z.array(FindingSchema).default([]), measurements: z.array(MeasurementSchema).default([]),
  evidence: z.array(EvidenceSchema).default([]), limitations: z.array(z.string()).default([]), toolVersions: z.record(z.string(), z.string()).default({})
}).superRefine((v, ctx) => {
  const ids = new Set(v.evidence.map(e => e.id));
  for (const f of v.findings) if (f.evidenceIds.some(id => !ids.has(id))) ctx.addIssue({ code: 'custom', message: `Preuve introuvable : ${f.id}` });
});
export const ResultSchema = z.object({
  schemaVersion: z.literal(schemaVersion), runId: z.string(), nodeId: z.string(), nodeVersion: z.string(), targetId: z.string(), block: z.enum(blocks),
  executionStatus: z.enum(executionStatuses), durationMs: z.number().nonnegative(),
  findings: z.array(FindingSchema), measurements: z.array(MeasurementSchema), evidence: z.array(EvidenceSchema), limitations: z.array(z.string()),
  error: z.string().optional(), toolVersions: z.record(z.string(), z.string()),
  attempts: z.array(z.object({ startedAt: z.string(), durationMs: z.number(), status: z.string(), error: z.string().optional() })),
  unstable: z.boolean().default(false)
});
export type Plan = z.infer<typeof PlanSchema>;
export type Target = z.infer<typeof TargetSchema>;
export type Journey = z.infer<typeof JourneySchema>;
export type Action = z.infer<typeof ActionSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type Output = z.infer<typeof OutputSchema>;
export type Result = z.infer<typeof ResultSchema>;
export type Block = typeof blocks[number];
export type Capability = { id: string; available: boolean; reason: string; version?: string };
export type SourceFile = { path: string; content: string };
export type Snapshot = { files: SourceFile[]; fingerprint: string; limitations: string[] };
export type Context = { plan: Plan; target: Target; snapshot: Snapshot; artifactDir: string; signal: AbortSignal };
export interface Check {
  id: string; version: string; block: Block; supportedTargets: Target['kind'][]; requiredCapabilities: string[];
  requiredDependencies: string[]; optionalDependencies: string[]; timeoutMs: number;
  retryPolicy: { maxAttempts: number; transientErrors: string[]; idempotent: boolean };
  resourceRequirements: string[]; inputSchema: z.ZodType; outputSchema: typeof OutputSchema;
  run: (context: Context) => Promise<Output>;
}
export type RunState = { schemaVersion: '1'; id: string; status: 'running' | 'completed' | 'partial' | 'cancelled' | 'interrupted'; plan: Plan; fingerprint: string; startedAt: string; endedAt?: string; capabilities: Record<string, Capability[]>; versions: Record<string, string>; limitations: string[]; checkVersions: Record<string, string> };
