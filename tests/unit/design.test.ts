import { it, expect } from 'vitest';
import { analyzeDesign, type DesignSnapshot, type DesignElement } from '../../packages/adapters/web/src/design.js';

const action = (overrides: Partial<DesignElement> = {}): DesignElement => ({ selector: 'article > a', tag: 'A', text: 'Découvrir', font: '14px Arial', color: 'white', background: 'green', padding: '12px', borderRadius: '4px', border: '0px none white', height: 42, unit: 'CSS px', family: 'offers', slot: 'action[0]', ...overrides });
const view = (overrides: Partial<DesignSnapshot> = {}): DesignSnapshot => ({ path: '/', viewport: { width: 1280, height: 900 }, elements: [], families: [], explicitGroups: [], truncated: false, ...overrides });
it('signale les différences d’actions homologues avec des preuves et une intention à confirmer', () => {
  const result = analyzeDesign([view({ elements: [action(), action({ selector: 'article:nth-child(2) > a', padding: '2px', borderRadius: '30px' })] })]);
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0]?.confidence).toBe('hypothesis');
  expect(result.findings[0]?.description).toContain('padding = 12px / 2px');
  expect(result.findings[0]?.evidenceIds).toEqual(['design-0', 'design-0-screen']);
});
it('ne confond ni hauteurs de texte, ni rôles différents, ni adaptations entre viewports', () => {
  expect(analyzeDesign([view({ elements: [action(), action({ text: 'Un intitulé plus long', height: 64 })] })]).findings).toEqual([]);
  expect(analyzeDesign([view({ elements: [action(), action({ family: 'delete', background: 'red' })] })]).findings).toEqual([]);
  expect(analyzeDesign([view({ elements: [action()] }), view({ viewport: { width: 375, height: 812 }, elements: [action({ padding: '20px' })] })]).findings).toEqual([]);
});
it('compare les espacements communs sans inventer un espacement nul pour un slot absent', () => {
  const result = analyzeDesign([view({ families: [{ id: 'offers', members: [{ selector: 'article:first-child', spacing: { padding: '16px', 'h3.margin': '20px', 'p.margin': '10px' } }, { selector: 'article:last-child', spacing: { padding: '4px', 'h3.margin': '44px' } }] }] })]);
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0]?.description).toContain('padding = 16px / 4px');
  expect(result.findings[0]?.description).not.toContain('p.margin');
});
it('compare entre pages seulement les groupes explicitement déclarés', () => {
  const snapshots = [view({ elements: [action()] }), view({ path: '/contact', elements: [action({ padding: '4px' })] })];
  expect(analyzeDesign(snapshots).findings).toEqual([]);
  expect(analyzeDesign([view({ scopeId: 'query-a', elements: [action()] }), view({ scopeId: 'query-b', elements: [action({ padding: '4px' })] })]).findings).toEqual([]);
  snapshots.forEach(snapshot => { snapshot.elements[0]!.explicitGroup = 'continue'; });
  expect(analyzeDesign(snapshots).findings[0]?.evidenceIds).toEqual(['design-0', 'design-0-screen', 'design-1', 'design-1-screen']);
});
