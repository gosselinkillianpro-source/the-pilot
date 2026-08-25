import { describe, expect, test } from 'vitest';
import {
  type AttributionInput,
  type AttributionSubscription,
  attributeSubscriptions,
  isRecruitedBy,
  registrationStatus,
} from '@/lib/webinars/attribution';

/**
 * Webinaires de référence : ceux du 13 et du 17 août 2026, aux heures réelles.
 * Les scénarios rejouent des cas observés en base — pas des cas d'école.
 */
const W13 = { id: 'w13', scheduledAt: new Date('2026-08-13T17:00:00Z') };
const W17 = { id: 'w17', scheduledAt: new Date('2026-08-17T17:00:00Z') };

function sub(
  id: string,
  investorId: string,
  amount: number,
  signedRef: string,
): AttributionSubscription {
  return { id, investorId, amount, signedRef: new Date(signedRef) };
}

function run(input: Partial<AttributionInput> & Pick<AttributionInput, 'investors'>) {
  return attributeSubscriptions({
    webinars: [W13, W17],
    registrations: [],
    subscriptions: [],
    ...input,
  });
}

/** Somme attribuée à un webinaire. */
function revenue(result: ReturnType<typeof attributeSubscriptions>, webinarId: string): number {
  return result.attributions
    .filter((a) => a.webinarId === webinarId)
    .reduce((sum, a) => sum + a.amount, 0);
}

describe('membre déjà présent avant le webinaire', () => {
  // Sylvain Soniliacque : compte SAH ouvert en mai 2025, amené par un
  // administrateur, 2 980 € placés avant le live. Il suit le 17/08 et remet 2 €.
  const sylvain = { id: 'sylvain', sahCreatedAt: new Date('2025-05-02T17:43:00Z') };
  const reg = {
    webinarId: W17.id,
    investorId: 'sylvain',
    registeredAt: new Date('2026-08-17T17:16:00Z'),
  };

  test('la première souscription après le live est attribuée au webinaire', () => {
    const result = run({
      investors: [sylvain],
      registrations: [reg],
      subscriptions: [
        sub('avant', 'sylvain', 2980, '2026-06-01T10:00:00Z'),
        sub('apres', 'sylvain', 2, '2026-08-24T13:30:00Z'),
      ],
    });

    expect(result.attributions).toEqual([
      expect.objectContaining({
        webinarId: W17.id,
        subscriptionId: 'apres',
        reason: 'first_after',
      }),
    ]);
  });

  test('les souscriptions SUIVANTES ne sont plus attribuées au webinaire', () => {
    const result = run({
      investors: [sylvain],
      registrations: [reg],
      subscriptions: [
        sub('avant', 'sylvain', 2980, '2026-06-01T10:00:00Z'),
        sub('apres-1', 'sylvain', 2, '2026-08-24T13:30:00Z'),
        sub('apres-2', 'sylvain', 50_000, '2026-11-02T09:00:00Z'),
        sub('apres-3', 'sylvain', 10_000, '2027-03-14T09:00:00Z'),
      ],
    });

    expect(result.attributions.map((a) => a.subscriptionId)).toEqual(['apres-1']);
    expect(revenue(result, W17.id)).toBe(2);
  });

  test("l'argent placé AVANT le webinaire n'est jamais compté", () => {
    const result = run({
      investors: [sylvain],
      registrations: [reg],
      subscriptions: [sub('avant', 'sylvain', 2980, '2026-06-01T10:00:00Z')],
    });

    expect(result.attributions).toHaveLength(0);
  });
});

describe('recrue du webinaire', () => {
  // serge passerat : compte SAH créé à 16h22 pour un live à 17h00, 40 000 €.
  const serge = { id: 'serge', sahCreatedAt: new Date('2026-08-17T16:22:00Z') };
  const reg = {
    webinarId: W17.id,
    investorId: 'serge',
    registeredAt: new Date('2026-08-14T15:23:00Z'),
  };

  test('un compte ouvert juste avant le live compte comme recrutement', () => {
    expect(isRecruitedBy(serge, W17, reg)).toBe(true);
  });

  test('toutes ses souscriptions reviennent au webinaire, sans limite de temps', () => {
    const result = run({
      investors: [serge],
      registrations: [reg],
      subscriptions: [
        sub('s1', 'serge', 40_000, '2026-08-24T11:00:00Z'),
        sub('s2', 'serge', 25_000, '2027-02-10T11:00:00Z'),
        sub('s3', 'serge', 15_000, '2028-01-05T11:00:00Z'),
      ],
    });

    expect(result.attributions).toHaveLength(3);
    expect(result.attributions.every((a) => a.reason === 'recruit')).toBe(true);
    expect(revenue(result, W17.id)).toBe(80_000);
  });

  test('un compte créé 10 jours APRÈS le live reste un recrutement', () => {
    // Claire Jamet : inscrite au 13/08, compte ouvert le 24/08, 6 000 € le jour même.
    const claire = { id: 'claire', sahCreatedAt: new Date('2026-08-24T06:35:00Z') };
    const result = run({
      investors: [claire],
      registrations: [
        { webinarId: W13.id, investorId: 'claire', registeredAt: new Date('2026-08-12T07:35:00Z') },
      ],
      subscriptions: [
        sub('c1', 'claire', 3000, '2026-08-24T11:53:00Z'),
        sub('c2', 'claire', 3000, '2026-08-24T12:07:00Z'),
      ],
    });

    expect(revenue(result, W13.id)).toBe(6000);
  });

  test('un compte ouvert dans les 15 jours avant le premier contact compte encore', () => {
    const phil = { id: 'phil', sahCreatedAt: new Date('2026-08-04T17:04:00Z') };
    const reg15 = {
      webinarId: W17.id,
      investorId: 'phil',
      registeredAt: new Date('2026-08-15T15:49:00Z'),
    };
    expect(isRecruitedBy(phil, W17, reg15)).toBe(true);
  });

  test('un compte ouvert plus de 15 jours avant le premier contact ne compte plus', () => {
    // Paul Bernard : compte du 19/06, inscrit au live le 14/08 — deux mois d'écart.
    const paul = { id: 'paul', sahCreatedAt: new Date('2026-06-19T19:43:00Z') };
    const reg2 = {
      webinarId: W17.id,
      investorId: 'paul',
      registeredAt: new Date('2026-08-14T01:16:00Z'),
    };
    expect(isRecruitedBy(paul, W17, reg2)).toBe(false);
  });

  test('avoir déjà souscrit avant le live disqualifie le recrutement', () => {
    // Compte ouvert 10 jours avant (dans la fenêtre), mais amené par un CGP :
    // il avait déjà placé 50 000 € quand le live a eu lieu.
    const cgp = { id: 'cgp', sahCreatedAt: new Date('2026-08-07T09:00:00Z') };
    const reg3 = {
      webinarId: W17.id,
      investorId: 'cgp',
      registeredAt: new Date('2026-08-16T09:00:00Z'),
    };
    const subs = [
      sub('avant', 'cgp', 50_000, '2026-08-08T09:00:00Z'),
      sub('apres-1', 'cgp', 20_000, '2026-08-18T09:00:00Z'),
      sub('apres-2', 'cgp', 20_000, '2026-09-18T09:00:00Z'),
    ];

    expect(isRecruitedBy(cgp, W17, reg3, subs)).toBe(false);

    const result = run({ investors: [cgp], registrations: [reg3], subscriptions: subs });
    expect(result.attributions.map((a) => a.subscriptionId)).toEqual(['apres-1']);
  });

  test("sans date de création de compte, on ne présume pas d'un recrutement", () => {
    const inconnu = { id: 'inconnu', sahCreatedAt: null };
    const reg4 = {
      webinarId: W17.id,
      investorId: 'inconnu',
      registeredAt: new Date('2026-08-15T09:00:00Z'),
    };
    expect(isRecruitedBy(inconnu, W17, reg4)).toBe(false);
  });
});

describe('plusieurs webinaires suivis par la même personne', () => {
  test('la recrue reste au crédit de son webinaire d’entrée, pas du dernier suivi', () => {
    // Recrutée par le 13/08, elle revient au 17/08 puis souscrit : le 13 garde tout.
    const recrue = { id: 'recrue', sahCreatedAt: new Date('2026-08-14T06:13:00Z') };
    const result = run({
      investors: [recrue],
      registrations: [
        { webinarId: W13.id, investorId: 'recrue', registeredAt: new Date('2026-08-12T09:42:00Z') },
        { webinarId: W17.id, investorId: 'recrue', registeredAt: new Date('2026-08-16T09:00:00Z') },
      ],
      subscriptions: [
        sub('r1', 'recrue', 200, '2026-08-14T08:04:00Z'),
        sub('r2', 'recrue', 5000, '2026-08-20T08:04:00Z'),
      ],
    });

    expect(revenue(result, W13.id)).toBe(5200);
    expect(revenue(result, W17.id)).toBe(0);
    expect(result.recruiterByInvestor.get('recrue')).toBe(W13.id);
  });

  test('une souscription n’est jamais comptée deux fois entre deux webinaires', () => {
    // Membre de longue date inscrit aux deux lives, un seul dépôt après : il
    // revient au webinaire le plus proche, et à lui seul.
    const ancien = { id: 'ancien', sahCreatedAt: new Date('2024-01-10T09:00:00Z') };
    const result = run({
      investors: [ancien],
      registrations: [
        { webinarId: W13.id, investorId: 'ancien', registeredAt: new Date('2026-08-12T09:00:00Z') },
        { webinarId: W17.id, investorId: 'ancien', registeredAt: new Date('2026-08-16T09:00:00Z') },
      ],
      subscriptions: [sub('a1', 'ancien', 9000, '2026-08-20T09:00:00Z')],
    });

    expect(result.attributions).toHaveLength(1);
    expect(revenue(result, W17.id)).toBe(9000);
    expect(revenue(result, W13.id)).toBe(0);
  });

  test('deux webinaires, deux dépôts : chacun garde le sien', () => {
    const ancien = { id: 'ancien', sahCreatedAt: new Date('2024-01-10T09:00:00Z') };
    const result = run({
      investors: [ancien],
      registrations: [
        { webinarId: W13.id, investorId: 'ancien', registeredAt: new Date('2026-08-12T09:00:00Z') },
        { webinarId: W17.id, investorId: 'ancien', registeredAt: new Date('2026-08-16T09:00:00Z') },
      ],
      subscriptions: [
        sub('a1', 'ancien', 1000, '2026-08-15T09:00:00Z'),
        sub('a2', 'ancien', 2000, '2026-08-20T09:00:00Z'),
      ],
    });

    expect(revenue(result, W13.id)).toBe(1000);
    expect(revenue(result, W17.id)).toBe(2000);
  });
});

describe('statut affiché à l’écran', () => {
  test('recrue de ce webinaire, recrue d’un autre, membre déjà là', () => {
    expect(registrationStatus(W13.id, W13.id)).toBe('recruit');
    expect(registrationStatus(W17.id, W13.id)).toBe('recruited_elsewhere');
    expect(registrationStatus(W17.id, undefined)).toBe('existing_member');
  });
});

describe('garde-fous généraux', () => {
  test('une inscription sans souscription n’attribue rien', () => {
    const result = run({
      investors: [{ id: 'vide', sahCreatedAt: new Date('2026-08-17T18:00:00Z') }],
      registrations: [{ webinarId: W17.id, investorId: 'vide', registeredAt: null }],
    });
    expect(result.attributions).toHaveLength(0);
  });

  test('une souscription sans inscription au webinaire n’est jamais attribuée', () => {
    const result = run({
      investors: [{ id: 'hors', sahCreatedAt: new Date('2026-08-18T09:00:00Z') }],
      registrations: [],
      subscriptions: [sub('h1', 'hors', 100_000, '2026-08-20T09:00:00Z')],
    });
    expect(result.attributions).toHaveLength(0);
  });

  test('chaque souscription n’apparaît qu’une fois dans le résultat', () => {
    const result = run({
      investors: [
        { id: 'recrue', sahCreatedAt: new Date('2026-08-14T06:13:00Z') },
        { id: 'ancien', sahCreatedAt: new Date('2024-01-10T09:00:00Z') },
      ],
      registrations: [
        { webinarId: W13.id, investorId: 'recrue', registeredAt: new Date('2026-08-12T09:42:00Z') },
        { webinarId: W17.id, investorId: 'recrue', registeredAt: new Date('2026-08-16T09:00:00Z') },
        { webinarId: W13.id, investorId: 'ancien', registeredAt: new Date('2026-08-12T09:00:00Z') },
        { webinarId: W17.id, investorId: 'ancien', registeredAt: new Date('2026-08-16T09:00:00Z') },
      ],
      subscriptions: [
        sub('r1', 'recrue', 200, '2026-08-14T08:04:00Z'),
        sub('r2', 'recrue', 5000, '2026-08-20T08:04:00Z'),
        sub('a1', 'ancien', 9000, '2026-08-20T09:00:00Z'),
      ],
    });

    const ids = result.attributions.map((a) => a.subscriptionId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
