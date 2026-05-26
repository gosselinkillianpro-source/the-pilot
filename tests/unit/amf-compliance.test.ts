import { describe, expect, it } from 'vitest';
import { assertAmfCompliant, scanAmfCompliance } from '@/lib/ai/amf-compliance';

describe('scanAmfCompliance', () => {
  it('passe un texte neutre', () => {
    const result = scanAmfCompliance('Découvrez nos club deals immobiliers privés.');
    expect(result.compliant).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('bloque le terme "garanti"', () => {
    const result = scanAmfCompliance('Rendement garanti à 15% par an');
    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => i.match === 'garanti')).toBe(true);
  });

  it('bloque "sans risque"', () => {
    const result = scanAmfCompliance('Un investissement sans risque pour vous.');
    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => i.match === 'sans risque')).toBe(true);
  });

  it('bloque "crowdfunding"', () => {
    const result = scanAmfCompliance('Plateforme de crowdfunding immobilier');
    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => i.match === 'crowdfunding')).toBe(true);
  });

  it('exige un disclaimer si un rendement est mentionné sans contexte', () => {
    const result = scanAmfCompliance('Vous toucherez 15% par an sur ce projet.');
    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => i.type === 'missing_disclaimer')).toBe(true);
  });

  it("accepte un rendement avec mention 'capital non garanti'", () => {
    const result = scanAmfCompliance(
      'Rendement cible 15% par an. Capital non garanti, soumis aux aléas du marché immobilier.',
    );
    expect(result.compliant).toBe(true);
  });

  it('ne fausse pas le scan quand "non garanti" est présent (disclaimer)', () => {
    const result = scanAmfCompliance('Capital non garanti, voir conditions.');
    expect(result.compliant).toBe(true);
  });

  it('assertAmfCompliant throw si non conforme', () => {
    expect(() => assertAmfCompliant('Investissement garanti 12%')).toThrow(
      /AMF_COMPLIANCE_BLOCKED/,
    );
  });

  it('assertAmfCompliant passe silencieusement si conforme', () => {
    expect(() =>
      assertAmfCompliant('Club deal immobilier privé, rendement cible 15%, capital non garanti.'),
    ).not.toThrow();
  });
});
