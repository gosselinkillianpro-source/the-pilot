import { describe, expect, test } from 'vitest';
import {
  classifyPortfolio,
  type PortfolioLead,
  type PortfolioPeriod,
  resolvePortfolioPeriod,
} from '@/lib/closing/portfolio';

/** Mardi 2 septembre 2026, 15 h heure de Paris (13 h UTC, heure d'été). */
const NOW = new Date('2026-09-02T13:00:00Z');

function lead(overrides: Partial<PortfolioLead>): PortfolioLead {
  return {
    investorId: 'inv-1',
    fullName: 'Jean Dupont',
    email: 'jean@example.com',
    phone: null,
    stage: 'contacted',
    enteredAt: new Date('2026-08-01T10:00:00Z'),
    registrationComplete: false,
    onboardingComplete: false,
    walletBalanceCents: null,
    nextActionAt: null,
    lastCallAt: null,
    totalInvestedEur: 0,
    subs: [],
    ...overrides,
  };
}

const ALL_TIME: PortfolioPeriod = { key: 'tout', from: null, to: null, label: 'Depuis le début' };

describe('resolvePortfolioPeriod', () => {
  test('retombe sur « tout » sans paramètre', () => {
    // Arrange + Act
    const p = resolvePortfolioPeriod({}, NOW);

    // Assert
    expect(p.key).toBe('tout');
    expect(p.from).toBeNull();
    expect(p.to).toBeNull();
  });

  test('la semaine démarre au lundi minuit heure de Paris', () => {
    const p = resolvePortfolioPeriod({ periode: 'semaine' }, NOW);

    // Lundi 31 août 2026, 00 h Paris = dimanche 30 août 22 h UTC (heure d'été).
    expect(p.key).toBe('semaine');
    expect(p.from?.toISOString()).toBe('2026-08-30T22:00:00.000Z');
    expect(p.to?.toISOString()).toBe('2026-09-06T22:00:00.000Z');
  });

  test('le mois couvre le mois civil parisien', () => {
    const p = resolvePortfolioPeriod({ periode: 'mois' }, NOW);

    expect(p.key).toBe('mois');
    expect(p.from?.toISOString()).toBe('2026-08-31T22:00:00.000Z'); // 1er sept. 00 h Paris
    expect(p.to?.toISOString()).toBe('2026-09-30T22:00:00.000Z'); // 1er oct. 00 h Paris
  });

  test('des dates libres valides priment sur l’onglet, borne « au » incluse', () => {
    const p = resolvePortfolioPeriod(
      { periode: 'semaine', du: '2026-08-10', au: '2026-08-12' },
      NOW,
    );

    expect(p.key).toBe('custom');
    expect(p.from?.toISOString()).toBe('2026-08-09T22:00:00.000Z'); // 10 août 00 h Paris
    // Borne exclue = 13 août 00 h Paris : le 12 août entier est couvert.
    expect(p.to?.toISOString()).toBe('2026-08-12T22:00:00.000Z');
    expect(p.label).toBe('du 10/08/2026 au 12/08/2026');
  });

  test('dates invalides ou inversées : on retombe sur l’onglet demandé', () => {
    expect(resolvePortfolioPeriod({ du: '2026-02-31', au: '2026-03-02' }, NOW).key).toBe('tout');
    expect(resolvePortfolioPeriod({ du: 'pouet', au: '2026-03-02' }, NOW).key).toBe('tout');
    expect(
      resolvePortfolioPeriod({ periode: 'semaine', du: '2026-03-05', au: '2026-03-01' }, NOW).key,
    ).toBe('semaine');
  });
});

describe('classifyPortfolio', () => {
  test('range chaque lead selon son jalon le plus avancé', () => {
    // Arrange
    const leads = [
      lead({
        investorId: 'a-investi',
        subs: [{ amountEur: 10_000, signedAt: new Date('2026-08-15T10:00:00Z') }],
        totalInvestedEur: 10_000,
      }),
      lead({ investorId: 'kyc-ok', onboardingComplete: true, registrationComplete: true }),
      lead({ investorId: 'inscrit', registrationComplete: true }),
      lead({ investorId: 'en-cours' }),
    ];

    // Act
    const s = classifyPortfolio(leads, ALL_TIME);

    // Assert
    expect(s.invested.map((e) => e.lead.investorId)).toEqual(['a-investi']);
    expect(s.kycReady.map((l) => l.investorId)).toEqual(['kyc-ok']);
    expect(s.registered.map((l) => l.investorId)).toEqual(['inscrit']);
    expect(s.inProgress.map((l) => l.investorId)).toEqual(['en-cours']);
    expect(s.investedOutside).toHaveLength(0);
  });

  test('cumule les montants et garde la dernière souscription comme date', () => {
    const leads = [
      lead({
        subs: [
          { amountEur: 5_000, signedAt: new Date('2026-08-10T10:00:00Z') },
          { amountEur: 20_000, signedAt: new Date('2026-08-20T10:00:00Z') },
        ],
      }),
    ];

    const s = classifyPortfolio(leads, ALL_TIME);

    expect(s.invested[0]?.attributableEur).toBe(25_000);
    expect(s.invested[0]?.periodEur).toBe(25_000);
    expect(s.invested[0]?.lastInvestAt.toISOString()).toBe('2026-08-20T10:00:00.000Z');
  });

  test('une période sort les investisseurs hors bornes vers « hors période »', () => {
    // Arrange — période : du 1er au 31 août (borne to exclue).
    const period: PortfolioPeriod = {
      key: 'custom',
      from: new Date('2026-08-01T00:00:00Z'),
      to: new Date('2026-09-01T00:00:00Z'),
      label: 'août',
    };
    const leads = [
      lead({
        investorId: 'dans-la-periode',
        subs: [
          { amountEur: 3_000, signedAt: new Date('2026-07-10T10:00:00Z') }, // avant
          { amountEur: 7_000, signedAt: new Date('2026-08-12T10:00:00Z') }, // dedans
        ],
      }),
      lead({
        investorId: 'hors-periode',
        subs: [{ amountEur: 4_000, signedAt: new Date('2026-07-01T10:00:00Z') }],
      }),
    ];

    // Act
    const s = classifyPortfolio(leads, period);

    // Assert — seul l'argent DANS la période compte pour periodEur, mais un
    // investisseur hors période ne redescend jamais en « KYC » ou « En cours ».
    expect(s.invested.map((e) => e.lead.investorId)).toEqual(['dans-la-periode']);
    expect(s.invested[0]?.periodEur).toBe(7_000);
    expect(s.invested[0]?.attributableEur).toBe(10_000);
    expect(s.investedOutside.map((e) => e.lead.investorId)).toEqual(['hors-periode']);
    expect(s.investedOutside[0]?.attributableEur).toBe(4_000);
  });

  test('trie les investisseurs du plus récent au plus ancien', () => {
    const leads = [
      lead({
        investorId: 'ancien',
        subs: [{ amountEur: 1_000, signedAt: new Date('2026-08-01T10:00:00Z') }],
      }),
      lead({
        investorId: 'recent',
        subs: [{ amountEur: 2_000, signedAt: new Date('2026-08-25T10:00:00Z') }],
      }),
    ];

    const s = classifyPortfolio(leads, ALL_TIME);

    expect(s.invested.map((e) => e.lead.investorId)).toEqual(['recent', 'ancien']);
  });

  test('les KYC validés se classent par wallet décroissant — l’argent à placer d’abord', () => {
    const leads = [
      lead({ investorId: 'petit-wallet', onboardingComplete: true, walletBalanceCents: 50_00 }),
      lead({ investorId: 'gros-wallet', onboardingComplete: true, walletBalanceCents: 2_000_00 }),
      lead({ investorId: 'sans-wallet', onboardingComplete: true, walletBalanceCents: null }),
    ];

    const s = classifyPortfolio(leads, ALL_TIME);

    expect(s.kycReady.map((l) => l.investorId)).toEqual([
      'gros-wallet',
      'petit-wallet',
      'sans-wallet',
    ]);
  });

  test('les « en cours » se classent par prochain rappel, les sans-rappel à la fin', () => {
    const leads = [
      lead({ investorId: 'sans-rappel', lastCallAt: new Date('2026-08-20T10:00:00Z') }),
      lead({ investorId: 'rappel-loin', nextActionAt: new Date('2026-09-10T10:00:00Z') }),
      lead({ investorId: 'rappel-proche', nextActionAt: new Date('2026-09-03T10:00:00Z') }),
    ];

    const s = classifyPortfolio(leads, ALL_TIME);

    expect(s.inProgress.map((l) => l.investorId)).toEqual([
      'rappel-proche',
      'rappel-loin',
      'sans-rappel',
    ]);
  });
});
