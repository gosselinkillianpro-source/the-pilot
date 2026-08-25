import { describe, expect, test } from 'vitest';
import {
  attendanceRate,
  type CallOrderInput,
  compareForCallOrder,
  formatDuration,
  getBucket,
  groupByBucket,
} from '@/lib/webinars/call-order';

/** Fabrique un inscrit, en ne précisant que ce qui compte pour le test. */
function sub(over: Partial<CallOrderInput> = {}): CallOrderInput {
  return {
    watchedLive: false,
    watchedReplay: false,
    watchDurationS: null,
    watchDurationReplayS: null,
    ...over,
  };
}

describe('getBucket', () => {
  test('classe en « présent » celui qui a suivi le direct', () => {
    expect(getBucket(sub({ watchedLive: true }))).toBe('present');
  });

  test('classe en « replay » celui qui a manqué le direct mais regardé après', () => {
    expect(getBucket(sub({ watchedReplay: true }))).toBe('replay');
  });

  test('classe en « no show » celui qui n’a rien regardé', () => {
    expect(getBucket(sub())).toBe('no_show');
  });

  test('le direct prime sur le replay quand les deux sont vrais', () => {
    expect(getBucket(sub({ watchedLive: true, watchedReplay: true }))).toBe('present');
  });
});

describe('compareForCallOrder', () => {
  test('un présent passe avant un spectateur du replay', () => {
    const present = sub({ watchedLive: true, watchDurationS: 60 });
    const replay = sub({ watchedReplay: true, watchDurationReplayS: 3600 });
    // Même avec une heure de replay contre une minute de direct : le direct prime.
    expect(compareForCallOrder(present, replay)).toBeLessThan(0);
  });

  test('un spectateur du replay passe avant un absent', () => {
    expect(compareForCallOrder(sub({ watchedReplay: true }), sub())).toBeLessThan(0);
  });

  test('entre présents, la plus longue durée passe devant', () => {
    const long = sub({ watchedLive: true, watchDurationS: 3000 });
    const court = sub({ watchedLive: true, watchDurationS: 120 });
    expect(compareForCallOrder(long, court)).toBeLessThan(0);
  });

  test('à durée égale, celui qui a cliqué un CTA passe devant', () => {
    const avecCta = sub({ watchedLive: true, watchDurationS: 600, ctaCount: 2 });
    const sansCta = sub({ watchedLive: true, watchDurationS: 600, ctaCount: 0 });
    expect(compareForCallOrder(avecCta, sansCta)).toBeLessThan(0);
  });
});

describe('groupByBucket', () => {
  test('rend les trois groupes dans l’ordre de rappel, même vides', () => {
    const groups = groupByBucket([sub()]);
    expect(groups.map((g) => g.bucket)).toEqual(['present', 'replay', 'no_show']);
    expect(groups[0]?.rows).toHaveLength(0);
    expect(groups[2]?.rows).toHaveLength(1);
  });

  test('trie les présents par durée décroissante', () => {
    const rows = [
      sub({ watchedLive: true, watchDurationS: 300 }),
      sub({ watchedLive: true, watchDurationS: 2700 }),
      sub({ watchedLive: true, watchDurationS: 1200 }),
    ];
    const presents = groupByBucket(rows)[0]?.rows ?? [];
    expect(presents.map((r) => r.watchDurationS)).toEqual([2700, 1200, 300]);
  });

  test('ne modifie pas le tableau d’entrée', () => {
    const rows = [sub({ watchedLive: true, watchDurationS: 10 }), sub()];
    const copie = [...rows];
    groupByBucket(rows);
    expect(rows).toEqual(copie);
  });
});

describe('formatDuration', () => {
  test('affiche les minutes en dessous d’une heure', () => {
    expect(formatDuration(2820)).toBe('47 min');
  });

  test('bascule en heures au-delà', () => {
    expect(formatDuration(4320)).toBe('1 h 12');
  });

  test('rend un tiret pour une durée absente ou nulle', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0)).toBe('—');
  });
});

describe('attendanceRate', () => {
  test('calcule la part réellement suivie', () => {
    expect(attendanceRate(1800, 60)).toBe(50);
  });

  test('plafonne à 100 % (le replay peut dépasser la durée annoncée)', () => {
    expect(attendanceRate(7200, 60)).toBe(100);
  });

  test('ne renvoie rien si la durée du webinaire est inconnue', () => {
    expect(attendanceRate(1800, null)).toBeNull();
  });
});
