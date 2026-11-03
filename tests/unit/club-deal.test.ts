// @vitest-environment node
import { describe, expect, test } from 'vitest';
import type { ClubDealRow } from '@/lib/club-deal/constants';
import { corsHeaders, csvCell, parseBody, validate } from '@/lib/club-deal/core';
import { computeStats } from '@/lib/club-deal/stats';

const ALLOWED = ['https://www.sevenathome.com', 'https://sevenathome.com'];

function row(o: Partial<ClubDealRow>): ClubDealRow {
  return {
    id: 1,
    ref: 'CD-2611-AAAA',
    created_at: new Date('2026-11-01T10:00:00Z'),
    prenom: 'A',
    nom: 'B',
    email: 'a@x.fr',
    telephone: null,
    consent_tel: false,
    statut: 'nouveau',
    dossiers: ['jonage'],
    montant: '10k-25k',
    disponibilite: '15j',
    message: '',
    duplicate_of: null,
    processing_status: 'nouveau',
    notes: '',
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    page_url: null,
    ip: null,
    user_agent: null,
    updated_at: new Date('2026-11-01T10:00:00Z'),
    ...o,
  };
}

describe('club deal : lecture du corps', () => {
  test('JSON envoyé en text/plain', () => {
    expect(parseBody('{"prenom":"Ana"}')).toEqual({ data: { prenom: 'Ana' }, isForm: false });
  });

  test('formulaire urlencoded avec dossiers[] répété', () => {
    const { data, isForm } = parseBody('prenom=Ana&dossiers%5B%5D=srl&dossiers%5B%5D=npl');
    expect(isForm).toBe(true);
    expect(data?.dossiers).toEqual(['srl', 'npl']);
  });

  test('JSON qui n’est pas un objet : refusé', () => {
    expect(parseBody('{oups').data).toBeNull();
  });
});

describe('club deal : validation', () => {
  test('balises HTML retirées et dossiers inconnus ignorés', () => {
    const { v } = validate({ prenom: '<b>Ana</b>', dossiers: ['srl', 'xxx', 'srl'] });
    expect(v.prenom).toBe('Ana');
    expect(v.dossiers).toEqual(['srl']);
  });

  test('un code hérité de Object.prototype n’est pas un statut valide', () => {
    expect(validate({ statut: 'constructor' }).errors.statut).toBeTruthy();
  });
});

describe('club deal : CORS et CSV', () => {
  test('origine du site autorisée, avec ou sans slash final', () => {
    expect(corsHeaders('https://sevenathome.com/', ALLOWED)['Access-Control-Allow-Origin']).toBe(
      'https://sevenathome.com/',
    );
    expect(
      corsHeaders('https://evil.example', ALLOWED)['Access-Control-Allow-Origin'],
    ).toBeUndefined();
  });

  test('cellule CSV : formule neutralisée et guillemets doublés', () => {
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('a;"b"')).toBe('"a;""b"""');
    expect(csvCell(['x', 'y'])).toBe('"x ; y"');
  });
});

describe('club deal : compteurs', () => {
  test('investisseurs distincts, tranche de la demande la plus récente, potentiel', () => {
    const stats = computeStats([
      row({ email: 'a@x.fr', montant: '2k-5k', created_at: new Date('2026-11-01') }),
      row({
        email: 'a@x.fr',
        montant: '10k-25k',
        dossiers: ['jonage', 'npl'],
        created_at: new Date('2026-11-02'),
        duplicate_of: 'CD-1',
      }),
      row({ email: 'b@x.fr', montant: 'gt100k', dossiers: ['srl'], processing_status: 'souscrit' }),
      row({
        email: 'c@x.fr',
        montant: 'nsp',
        processing_status: 'contacte',
        telephone: '+33600000000',
        consent_tel: true,
      }),
    ]);
    expect(stats.total).toBe(4);
    expect(stats.investors).toBe(3);
    expect(stats.toProcess).toBe(2);
    expect(stats.subscribed).toBe(1);
    expect(stats.duplicates).toBe(1);
    expect(stats.withCallConsent).toBe(1);
    expect(stats.tranches.find((t) => t.code === '10k-25k')?.investors).toBe(1);
    expect(stats.tranches.find((t) => t.code === '2k-5k')?.investors).toBe(0);
    expect(stats.potential).toEqual({ min: 110_000, max: null, undisclosed: 1 });
    const jonage = stats.projects.find((p) => p.code === 'jonage');
    expect(jonage).toMatchObject({ intentions: 3, investors: 2, toProcess: 2, subscribed: 0 });
    expect(stats.projects.find((p) => p.code === 'srl')).toMatchObject({
      investors: 1,
      subscribed: 1,
    });
  });

  test('aucune demande : tout à zéro', () => {
    const stats = computeStats([]);
    expect(stats.total).toBe(0);
    expect(stats.potential).toEqual({ min: 0, max: 0, undisclosed: 0 });
  });
});
