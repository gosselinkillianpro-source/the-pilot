import { describe, expect, test } from 'vitest';
import { type RoutingCandidate, rankCandidates } from '@/lib/domain/routing';

const base = (over: Partial<RoutingCandidate>): RoutingCandidate => ({
  buyerId: 'x',
  name: 'x',
  active: true,
  pausedUntil: null,
  priority: 1,
  dailyCap: null,
  weeklyCap: null,
  dailyCount: 0,
  weeklyCount: 0,
  packRemaining: null,
  lastRoutedAt: null,
  ...over,
});

const now = new Date('2026-09-04T10:00:00Z');

describe('rankCandidates', () => {
  test('exclut inactifs, en pause, non qualifiés, plafonnés, packs épuisés', () => {
    const cands = [
      base({ buyerId: 'inactif', active: false }),
      base({ buyerId: 'pause', pausedUntil: new Date('2026-09-10T00:00:00Z') }),
      base({ buyerId: 'nonqual' }),
      base({ buyerId: 'jour', dailyCap: 2, dailyCount: 2 }),
      base({ buyerId: 'semaine', weeklyCap: 5, weeklyCount: 5 }),
      base({ buyerId: 'pack', packRemaining: 0 }),
      base({ buyerId: 'ok' }),
    ];
    const qualified = new Set(['inactif', 'pause', 'jour', 'semaine', 'pack', 'ok']);
    const r = rankCandidates(cands, qualified, now);
    expect(r.eligible.map((c) => c.buyerId)).toEqual(['ok']);
    expect(Object.fromEntries(r.excluded.map((e) => [e.candidate.buyerId, e.reason]))).toEqual({
      inactif: 'inactif',
      pause: 'en_pause',
      nonqual: 'non_qualifie',
      jour: 'plafond_jour',
      semaine: 'plafond_semaine',
      pack: 'pack_epuise',
    });
  });
  test('trie par priorité puis par équité (le moins récemment servi)', () => {
    const cands = [
      base({ buyerId: 'p2', priority: 2 }),
      base({ buyerId: 'p1-recent', priority: 1, lastRoutedAt: new Date('2026-09-04T09:00:00Z') }),
      base({ buyerId: 'p1-ancien', priority: 1, lastRoutedAt: new Date('2026-09-01T09:00:00Z') }),
      base({ buyerId: 'p1-jamais', priority: 1 }),
    ];
    const r = rankCandidates(cands, new Set(cands.map((c) => c.buyerId)), now);
    expect(r.eligible.map((c) => c.buyerId)).toEqual(['p1-jamais', 'p1-ancien', 'p1-recent', 'p2']);
  });
  test('pause expirée : de nouveau éligible', () => {
    const c = base({ buyerId: 'a', pausedUntil: new Date('2026-09-01T00:00:00Z') });
    expect(rankCandidates([c], new Set(['a']), now).eligible).toHaveLength(1);
  });
});
