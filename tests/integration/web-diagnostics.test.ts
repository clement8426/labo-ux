import { it, expect } from 'vitest';
import { resourceDiagnostics, lighthouseDiagnostics, type ResourceObservation } from '../../packages/adapters/web/src/diagnostics.js';
const resource = (overrides: Partial<ResourceObservation> = {}): ResourceObservation => ({ url: 'http://localhost:4192/media/lac', type: 'image', status: 200, cacheControl: 'no-store, max-age=0', contentType: 'image/png', encodedBodySize: 2_000_000, transferSize: 2_000_300, durationMs: 1200, ...overrides });
it('rend visibles les octets et le cache des images observées avec une preuve', () => {
  const result = resourceDiagnostics([resource()], 'http://localhost:4192/');
  expect(result.findings).toHaveLength(2);
  expect(result.findings.every(f => f.evidenceIds.includes('resources'))).toBe(true);
  expect(result.measurements.find(m => m.name === 'resources.observed-image-bytes')?.value).toBe(2_000_000);
});
it('ne généralise pas le cache aux API, erreurs, domaines tiers ou tailles inconnues', () => {
  const result = resourceDiagnostics([
    resource({ type: 'fetch' }), resource({ status: 404 }),
    resource({ url: 'https://external.test/image', encodedBodySize: null }),
    resource({ cacheControl: 'public, max-age=3600', encodedBodySize: null })
  ], 'http://localhost:4192/');
  expect(result.findings).toHaveLength(0);
  expect(result.measurements.some(m => m.name === 'resources.observed-image-bytes')).toBe(false);
});
it('ne considère pas no-cache comme absence de stockage et distingue les URL', () => {
  const result = resourceDiagnostics([resource({ cacheControl: 'no-cache', encodedBodySize: 100 }), resource({ url: 'http://localhost:4192/media/autre', encodedBodySize: 100 })], 'http://localhost:4192/');
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0]?.title).toContain('sans stockage');
});
it('ne remonte que les diagnostics Lighthouse mesurés de la catégorie performance', () => {
  const audits = {
    images: { title: 'Image delivery', description: 'Compression', score: 0, scoreDisplayMode: 'metricSavings', details: { type: 'table' } },
    passed: { score: 1, details: {} }, error: { score: null, scoreDisplayMode: 'error', details: {} },
    manual: { score: 0, scoreDisplayMode: 'manual', details: {} },
    a11y: { score: 0, details: {} }, metric: { score: 0.2 }
  };
  const result = lighthouseDiagnostics({ audits, categories: { performance: { auditRefs: ['images', 'passed', 'error', 'manual', 'metric'].map(id => ({ id })) } } });
  expect(result.map(f => f.id)).toEqual(['lighthouse.images']);
  expect(result[0]?.recommendation).toContain('estimations');
  expect(lighthouseDiagnostics({ audits })).toEqual([]);
});
