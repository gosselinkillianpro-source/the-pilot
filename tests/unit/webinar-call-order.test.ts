import { describe, expect, test } from 'vitest';
import {
  type CallOrderInput,
  callScore,
  compareForCallOrder,
  engagementScore,
  formatDuration,
  getBucket,
  groupByBucket,
  parseAvailability,
  parseCapacity,
  totalWatchedS,
} from '@/lib/webinars/call-order';

/** Webinaire de référence : 78 minutes, la durée réelle du 17 août. */
const WEBINAR_S = 78 * 60;

function sub(over: Partial<CallOrderInput> = {}): CallOrderInput {
  return {
    watchedLive: false,
    watchedReplay: false,
    watchDurationS: null,
    watchDurationReplayS: null,
    webinarDurationS: WEBINAR_S,
    ...over,
  };
}

describe('parseCapacity', () => {
  test('reconnaît les tranches réelles du formulaire', () => {
    expect(parseCapacity('+500 000€').rank).toBe(6);
    expect(parseCapacity('250 000€ - 500 000€').rank).toBe(5);
    expect(parseCapacity('50 000€ - 250 000€').rank).toBe(4);
    expect(parseCapacity('10 000€ - 25 000€').rank).toBe(2);
    expect(parseCapacity('Moins de 10 000€').rank).toBe(1);
  });

  test('reconnaît la tranche mal orthographiée du formulaire (« 50 0000€ »)', () => {
    // Coquille côté WebinarGeek : un zéro en trop. On la reconnaît pour ne pas
    // perdre les 7 réponses déjà collectées.
    expect(parseCapacity('25 000€ - 50 0000€').rank).toBe(3);
  });

  test('tolère l’espace final de « Je ne sais pas encore »', () => {
    expect(parseCapacity('Je ne sais pas encore ').label).toBe('À qualifier');
  });

  test('classe « je ne sais pas » au-dessus d’un petit ticket déclaré', () => {
    // Un montant inconnu garde son potentiel ; un petit ticket est un plafond.
    expect(parseCapacity('Je ne sais pas encore ').rank).toBeGreaterThan(
      parseCapacity('Moins de 10 000€').rank,
    );
  });

  test('renvoie un rang nul quand le champ est absent', () => {
    expect(parseCapacity(null).rank).toBe(0);
    expect(parseCapacity(undefined).rank).toBe(0);
  });
});

describe('parseAvailability', () => {
  test('traduit les trois réponses possibles', () => {
    expect(parseAvailability('Oui')).toBe(1);
    expect(parseAvailability('En partie')).toBe(0.5);
    expect(parseAvailability('Non')).toBe(0);
    expect(parseAvailability(null)).toBe(0);
  });
});

describe('engagement', () => {
  test('additionne direct et replay', () => {
    expect(totalWatchedS(sub({ watchDurationS: 600, watchDurationReplayS: 300 }))).toBe(900);
  });

  test('rapporte le temps regardé à la durée du webinaire', () => {
    expect(engagementScore(sub({ watchDurationS: WEBINAR_S / 2 }))).toBe(50);
  });

  test('plafonne à 100 % (replay + direct peuvent dépasser)', () => {
    expect(
      engagementScore(sub({ watchDurationS: WEBINAR_S, watchDurationReplayS: WEBINAR_S })),
    ).toBe(100);
  });
});

describe('compareForCallOrder — la correction demandée', () => {
  test('une heure de replay passe devant une minute de direct', () => {
    // C'était l'erreur du premier barème : le canal primait sur la durée.
    const minuteDeDirect = sub({ watchedLive: true, watchDurationS: 60 });
    const heureDeReplay = sub({ watchedReplay: true, watchDurationReplayS: 3600 });
    expect(compareForCallOrder(heureDeReplay, minuteDeDirect)).toBeLessThan(0);
  });

  test('à engagement égal, la plus grosse capacité passe devant', () => {
    const gros = sub({ watchedLive: true, watchDurationS: 1800, capacityRaw: '+500 000€' });
    const petit = sub({ watchedLive: true, watchDurationS: 1800, capacityRaw: 'Moins de 10 000€' });
    expect(compareForCallOrder(gros, petit)).toBeLessThan(0);
  });

  test('la capacité peut compenser un engagement plus faible', () => {
    const grosPeuEngagé = sub({
      watchedReplay: true,
      watchDurationReplayS: 900,
      capacityRaw: '+500 000€',
      availabilityRaw: 'Oui',
    });
    const petitTrèsEngagé = sub({
      watchedLive: true,
      watchDurationS: WEBINAR_S,
      capacityRaw: 'Moins de 10 000€',
      availabilityRaw: 'Non',
    });
    expect(compareForCallOrder(grosPeuEngagé, petitTrèsEngagé)).toBeLessThan(0);
  });

  test('à capacité et engagement égaux, les fonds disponibles départagent', () => {
    const dispo = sub({ watchedLive: true, watchDurationS: 1800, availabilityRaw: 'Oui' });
    const pasDispo = sub({ watchedLive: true, watchDurationS: 1800, availabilityRaw: 'Non' });
    expect(compareForCallOrder(dispo, pasDispo)).toBeLessThan(0);
  });

  test('un CTA cliqué fait remonter', () => {
    const avecCta = sub({ watchedLive: true, watchDurationS: 1200, ctaCount: 1 });
    const sansCta = sub({ watchedLive: true, watchDurationS: 1200, ctaCount: 0 });
    expect(compareForCallOrder(avecCta, sansCta)).toBeLessThan(0);
  });

  test('aucun absent ne passe devant quelqu’un qui a regardé, même très riche', () => {
    // Garde-fou : le groupe prime toujours sur le score.
    const absentRiche = sub({ capacityRaw: '+500 000€', availabilityRaw: 'Oui' });
    const présentModeste = sub({
      watchedReplay: true,
      watchDurationReplayS: 120,
      capacityRaw: 'Moins de 10 000€',
    });
    expect(compareForCallOrder(présentModeste, absentRiche)).toBeLessThan(0);
  });

  test('à engagement égal, le direct départage le replay', () => {
    const direct = sub({ watchedLive: true, watchDurationS: 1800 });
    const replay = sub({ watchedReplay: true, watchDurationReplayS: 1800 });
    expect(compareForCallOrder(direct, replay)).toBeLessThan(0);
  });
});

describe('callScore', () => {
  test('reste borné entre 0 et 100', () => {
    const max = sub({
      watchedLive: true,
      watchDurationS: WEBINAR_S,
      capacityRaw: '+500 000€',
      availabilityRaw: 'Oui',
      ctaCount: 5,
    });
    const score = callScore(max);
    expect(score).toBeGreaterThan(90);
    expect(score).toBeLessThanOrEqual(101); // +1 de départage « direct »
    expect(callScore(sub())).toBe(0);
  });
});

describe('groupByBucket', () => {
  test('ne rend que deux groupes : ont regardé, puis absents', () => {
    const groups = groupByBucket([sub()]);
    expect(groups.map((g) => g.bucket)).toEqual(['watched', 'no_show']);
  });

  test('fusionne direct et replay dans un seul groupe', () => {
    const rows = [
      sub({ watchedLive: true, watchDurationS: 600 }),
      sub({ watchedReplay: true, watchDurationReplayS: 3000 }),
      sub(),
    ];
    const groups = groupByBucket(rows);
    expect(groups[0]?.rows).toHaveLength(2);
    expect(groups[1]?.rows).toHaveLength(1);
  });

  test('ne modifie pas le tableau d’entrée', () => {
    const rows = [sub({ watchedLive: true, watchDurationS: 10 }), sub()];
    const copie = [...rows];
    groupByBucket(rows);
    expect(rows).toEqual(copie);
  });
});

describe('getBucket', () => {
  test('regroupe direct et replay', () => {
    expect(getBucket(sub({ watchedLive: true }))).toBe('watched');
    expect(getBucket(sub({ watchedReplay: true }))).toBe('watched');
    expect(getBucket(sub())).toBe('no_show');
  });
});

describe('formatDuration', () => {
  test('minutes, heures, et absence', () => {
    expect(formatDuration(2820)).toBe('47 min');
    expect(formatDuration(4320)).toBe('1 h 12');
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0)).toBe('—');
  });
});
