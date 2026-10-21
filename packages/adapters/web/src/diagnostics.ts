import { createHash } from 'node:crypto';
import type { Finding, Output } from '../../../contracts/src/index.js';
type Measurement = Output['measurements'][number];
export type ResourceObservation = {
  url: string; type: string; status: number; cacheControl: string; contentType: string;
  encodedBodySize: number | null; transferSize: number | null; durationMs: number | null;
};
export function resourceDiagnostics(resources: ResourceObservation[], pageUrl: string) {
  const findings: Finding[] = [], measurements: Measurement[] = [];
  const images = resources.filter(r => r.type === 'image' && r.status >= 200 && r.status < 300);
  for (const image of images) {
    const id = createHash('sha256').update(image.url).digest('hex').slice(0, 12);
    if (image.encodedBodySize !== null && image.encodedBodySize > 1_000_000) findings.push({
      id: `large-image-${id}`, title: 'Image de plus de 1 Mo transférée',
      description: `${image.url} : ${image.encodedBodySize} octets encodés. Le seuil de 1 Mo est un repère de tri du kit, pas une norme ni une preuve suffisante d’impact UX.`,
      severity: 'minor', confidence: 'confirmed', evidenceIds: ['resources'], recommendation: 'Comparer le format, la compression et les dimensions avec le besoin à l’écran ; mesurer à nouveau après toute optimisation.'
    });
    // No cache verdict on API responses or third-party assets. No-store is an
    // observation, not an automatic fault for private or frequently changing media.
    if (new URL(image.url).origin === new URL(pageUrl).origin && /(?:^|,)\s*no-store(?:\s|,|$)/i.test(image.cacheControl)) findings.push({
      id: `uncached-image-${id}`, title: 'Image servie sans stockage en cache',
      description: `${image.url} : Cache-Control: ${image.cacheControl}. La pertinence dépend du caractère public, stable ou sensible de l’image.`,
      severity: 'minor', confidence: 'confirmed', evidenceIds: ['resources'], recommendation: 'Si l’image est publique et réutilisable, étudier une politique de cache avec invalidation adaptée. Ne pas appliquer cette recommandation aux réponses privées ou aux opérations du formulaire.'
    });
  }
  const knownImageSizes = images.filter(r => r.encodedBodySize !== null);
  if (knownImageSizes.length) measurements.push({ name: 'resources.observed-image-bytes', value: knownImageSizes.reduce((sum, r) => sum + r.encodedBodySize!, 0), unit: 'bytes', context: { source: 'Resource Timing ou Content-Length ; corps encodés observés', coverage: `${knownImageSizes.length}/${images.length} images`, url: pageUrl } });
  measurements.push({ name: 'resources.image-count', value: images.length, unit: 'count', context: { url: pageUrl } });
  return { findings, measurements };
}
type LighthouseAudit = { title?: string; description?: string; displayValue?: string; score: number | null; scoreDisplayMode?: string; details?: unknown };
export function lighthouseDiagnostics(lhr: { audits: Record<string, LighthouseAudit>; categories?: { performance?: { auditRefs?: { id: string }[] } } }): Finding[] {
  const ids = new Set(lhr.categories?.performance?.auditRefs?.map(ref => ref.id) ?? []);
  return Object.entries(lhr.audits).filter(([id, audit]) => ids.has(id) && typeof audit.score === 'number' && audit.score < 1 && audit.details && !['manual', 'notApplicable', 'error', 'informative'].includes(audit.scoreDisplayMode ?? '')).map(([id, audit]) => ({
    id: `lighthouse.${id}`, title: audit.title ?? id, severity: 'minor', confidence: 'confirmed', evidenceIds: ['lighthouse'],
    description: `${audit.displayValue ?? 'Diagnostic Lighthouse en échec sur cette mesure.'} ${audit.description ?? ''}`,
    recommendation: `Consulter audits[${JSON.stringify(id)}] dans lighthouse.json pour les ressources concernées. Les économies sont des estimations de laboratoire, à vérifier avant de conclure à un gain réel.`
  }));
}
