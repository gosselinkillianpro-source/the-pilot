import { describe, expect, test } from 'vitest';
import { endOfParisDay, goalProgressPct, sessionOrder, splitTasks } from '@/lib/closing/day';
import type { Pool, PoolCandidate } from '@/lib/closing/pool';

/** Vendredi 4 septembre 2026, 14 h à Paris (12 h UTC). */
const NOW = new Date('2026-09-04T12:00:00Z');

describe('splitTasks', () => {
  test('en retard, maintenant, plus tard aujourd’hui, à venir — sans doublon', () => {
    const tasks = [
      { id: 'late', dueAt: new Date('2026-09-03T14:00:00Z') },
      { id: 'now', dueAt: new Date('2026-09-04T12:30:00Z') },
      { id: 'later', dueAt: new Date('2026-09-04T16:00:00Z') },
      { id: 'tomorrow', dueAt: new Date('2026-09-05T08:00:00Z') },
      { id: 'late2', dueAt: new Date('2026-09-04T11:00:00Z') },
    ];
    const s = splitTasks(tasks, NOW);
    expect(s.overdue.map((t) => t.id)).toEqual(['late', 'late2']);
    expect(s.dueToday.map((t) => t.id)).toEqual(['now']);
    expect(s.laterToday.map((t) => t.id)).toEqual(['later']);
    expect(s.upcoming.map((t) => t.id)).toEqual(['tomorrow']);
  });

  test('la fin de journée est minuit heure de Paris', () => {
    // 5 septembre 00:00 Paris = 4 septembre 22:00 UTC (heure d'été).
    expect(endOfParisDay(NOW).toISOString()).toBe('2026-09-04T22:00:00.000Z');
    const s = splitTasks([{ dueAt: new Date('2026-09-04T21:30:00Z') }], NOW);
    expect(s.laterToday).toHaveLength(1);
  });
});

function row(id: string, tier: 'breach' | 'other' | 'hot' | 'base' = 'other') {
  const c: PoolCandidate & { id: string } = {
    id,
    assignedCloserId: null,
    origin: tier === 'breach' ? 'ads' : 'other',
    scored: {
      isNewLead: tier === 'breach' || tier === 'other',
      queueBucket: tier === 'hot' ? 3 : tier === 'base' ? 6 : 1,
    },
  };
  return c;
}

describe('sessionOrder', () => {
  test('réservés, dus, pubs, autres nouveaux, chauds, base — chacun une fois', () => {
    const pool: Pool<ReturnType<typeof row>> = {
      breach_new: [row('b1', 'breach'), row('dup', 'breach')],
      other_new: [row('o1')],
      hot: [row('h1', 'hot')],
      base: [row('z1', 'base')],
    };
    const order = sessionOrder({
      reserved: [row('r1')],
      due: [row('d1'), row('dup')],
      pool,
      backlog: [row('k1')],
    });
    expect(order.map((r) => r.id)).toEqual(['r1', 'd1', 'dup', 'b1', 'o1', 'h1', 'k1', 'z1']);
  });

  test('respecte la limite', () => {
    const pool: Pool<ReturnType<typeof row>> = {
      breach_new: [row('b1', 'breach'), row('b2', 'breach'), row('b3', 'breach')],
      other_new: [],
      hot: [],
      base: [],
    };
    expect(sessionOrder({ reserved: [], due: [], pool }, 2)).toHaveLength(2);
  });
});

describe('goalProgressPct', () => {
  test('borné entre 0 et 100', () => {
    expect(goalProgressPct(23, 40)).toBe(57);
    expect(goalProgressPct(20, 40)).toBe(50);
    expect(goalProgressPct(80, 40)).toBe(100);
    expect(goalProgressPct(0, 40)).toBe(0);
  });
});
