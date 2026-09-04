import { describe, expect, test } from 'vitest';
import { buildPool, isThirdPartyCgp, type PoolCandidate, urgentCount } from '@/lib/closing/pool';

function row(overrides: Partial<PoolCandidate> & { id: string }): PoolCandidate & { id: string } {
  return {
    assignedCloserId: null,
    isBreach: false,
    cgpName: null,
    cgpNetwork: null,
    scored: { isNewLead: false, queueBucket: 7 },
    ...overrides,
  };
}

describe('isThirdPartyCgp', () => {
  test('BREACH et Guillaume Gosselin sont « maison », un autre nom est un partenaire', () => {
    expect(isThirdPartyCgp('BREACH', null)).toBe(false);
    expect(isThirdPartyCgp('Guillaume Gosselin', null)).toBe(false);
    expect(isThirdPartyCgp(null, null)).toBe(false);
    expect(isThirdPartyCgp('', '  ')).toBe(false);
    expect(isThirdPartyCgp('Cabinet Martin', 'Réseau X')).toBe(true);
    expect(isThirdPartyCgp('Cabinet Martin', 'BREACH')).toBe(false);
  });
});

describe('buildPool — l’ordre du 4 septembre', () => {
  test('pubs d’abord, puis autres nouveaux, moments chauds, base', () => {
    const pool = buildPool([
      row({ id: 'base', scored: { isNewLead: false, queueBucket: 5 } }),
      row({ id: 'hot', scored: { isNewLead: false, queueBucket: 4 } }),
      row({ id: 'new-other', scored: { isNewLead: true, queueBucket: 1 } }),
      row({ id: 'new-breach', isBreach: true, scored: { isNewLead: true, queueBucket: 1 } }),
    ]);
    expect(pool.breach_new.map((r) => r.id)).toEqual(['new-breach']);
    expect(pool.other_new.map((r) => r.id)).toEqual(['new-other']);
    expect(pool.hot.map((r) => r.id)).toEqual(['hot']);
    expect(pool.base.map((r) => r.id)).toEqual(['base']);
    expect(urgentCount(pool)).toBe(3);
  });

  test('les personnes suivies et les clients de CGP tiers ne sont pas dans le pool', () => {
    const pool = buildPool([
      row({
        id: 'owned',
        assignedCloserId: 'yannick',
        scored: { isNewLead: true, queueBucket: 1 },
      }),
      row({ id: 'cgp', cgpName: 'Cabinet Martin', scored: { isNewLead: true, queueBucket: 1 } }),
      row({ id: 'free', isBreach: true, scored: { isNewLead: true, queueBucket: 1 } }),
    ]);
    expect(pool.breach_new.map((r) => r.id)).toEqual(['free']);
    expect(pool.other_new).toEqual([]);
  });

  test('conserve l’ordre d’entrée à l’intérieur d’un niveau', () => {
    const pool = buildPool([
      row({ id: 'a', isBreach: true, scored: { isNewLead: true, queueBucket: 1 } }),
      row({ id: 'b', isBreach: true, scored: { isNewLead: true, queueBucket: 1 } }),
    ]);
    expect(pool.breach_new.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
