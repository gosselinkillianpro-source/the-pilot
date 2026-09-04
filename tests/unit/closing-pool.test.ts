import { describe, expect, test } from 'vitest';
import {
  buildPool,
  groupPool,
  isThirdPartyCgp,
  type PoolCandidate,
  urgentCount,
} from '@/lib/closing/pool';

function row(overrides: Partial<PoolCandidate> & { id: string }): PoolCandidate & { id: string } {
  return {
    assignedCloserId: null,
    origin: 'other',
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
      row({ id: 'new-breach', origin: 'ads', scored: { isNewLead: true, queueBucket: 1 } }),
    ]);
    expect(pool.breach_new.map((r) => r.id)).toEqual(['new-breach']);
    expect(pool.other_new.map((r) => r.id)).toEqual(['new-other']);
    expect(pool.hot.map((r) => r.id)).toEqual(['hot']);
    expect(pool.base.map((r) => r.id)).toEqual(['base']);
    expect(urgentCount(pool)).toBe(3);
  });

  test('les personnes suivies et les clients de partenaires ne sont pas dans le pool', () => {
    const pool = buildPool([
      row({
        id: 'owned',
        assignedCloserId: 'yannick',
        scored: { isNewLead: true, queueBucket: 1 },
      }),
      row({ id: 'cgp', origin: 'partner', scored: { isNewLead: true, queueBucket: 1 } }),
      row({ id: 'free', origin: 'ads', scored: { isNewLead: true, queueBucket: 1 } }),
    ]);
    expect(pool.breach_new.map((r) => r.id)).toEqual(['free']);
    expect(pool.other_new).toEqual([]);
  });

  test('conserve l’ordre d’entrée à l’intérieur d’un niveau', () => {
    const pool = buildPool([
      row({ id: 'a', origin: 'ads', scored: { isNewLead: true, queueBucket: 1 } }),
      row({ id: 'b', origin: 'ads', scored: { isNewLead: true, queueBucket: 1 } }),
    ]);
    expect(pool.breach_new.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('groupPool — chaque groupe dit pourquoi on appelle', () => {
  test('pubs, autres nouveaux, puis une raison par groupe chaud, puis la base', () => {
    const rows = [
      { ...row({ id: 'kyc', scored: { isNewLead: false, queueBucket: 5 } }) },
      { ...row({ id: 'remb', scored: { isNewLead: false, queueBucket: 4 } }) },
      { ...row({ id: 'merci', scored: { isNewLead: false, queueBucket: 2 } }) },
      { ...row({ id: 'wallet', scored: { isNewLead: false, queueBucket: 3 } }) },
      { ...row({ id: 'pub', origin: 'ads', scored: { isNewLead: true, queueBucket: 1 } }) },
      { ...row({ id: 'autre', scored: { isNewLead: true, queueBucket: 1 } }) },
      { ...row({ id: 'relation', scored: { isNewLead: false, queueBucket: 9 } }) },
    ];
    const groups = groupPool(buildPool(rows));
    expect(groups.map((g) => [g.key, g.urgent, g.rows.map((r) => r.id)])).toEqual([
      ['breach_new', true, ['pub']],
      ['other_new', true, ['autre']],
      ['bucket_2', true, ['merci']],
      ['bucket_3', true, ['wallet']],
      ['bucket_4', true, ['remb']],
      ['bucket_5', false, ['kyc']],
      ['bucket_9', false, ['relation']],
    ]);
    expect(groups.find((g) => g.key === 'bucket_2')?.label).toBe(
      'Viennent d’investir · à remercier',
    );
    expect(groups.every((g) => g.hint.length > 0)).toBe(true);
  });

  test('les groupes vides sont omis', () => {
    const groups = groupPool(
      buildPool([row({ id: 'kyc', scored: { isNewLead: false, queueBucket: 5 } })]),
    );
    expect(groups.map((g) => g.key)).toEqual(['bucket_5']);
  });
});
