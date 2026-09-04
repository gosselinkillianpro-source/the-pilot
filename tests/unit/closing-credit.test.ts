import { describe, expect, test } from 'vitest';
import {
  type CreditAction,
  type CreditableSub,
  creditActionKind,
  creditEvent,
  creditInvestorSubscriptions,
} from '@/lib/closing/credit';

const day = (d: string) => new Date(`${d}T10:00:00Z`);
const call = (d: string, reached = true): CreditAction => ({ at: day(d), kind: 'call', reached });
const sub = (id: string, d: string, amountEur = 10_000): CreditableSub => ({
  id,
  signedAt: day(d),
  amountEur,
});

describe('creditInvestorSubscriptions — la règle du 4 septembre', () => {
  test('exemple de Killian : appel le 1er, 10 000 € le 5 → crédités', () => {
    const [first] = creditInvestorSubscriptions({
      subs: [sub('s1', '2026-09-05')],
      ownerId: 'yannick',
      ownerActions: [call('2026-09-01')],
    });
    expect(first?.credited).toBe(true);
    expect(first?.closerId).toBe('yannick');
    expect(first?.kind).toBe('first');
    expect(first?.daysBefore).toBe(4);
    expect(first?.explanation).toBe('1re souscription · appel joint J-4');
  });

  test('réinvestissement 4 mois plus tard sans contact → pas crédité', () => {
    const res = creditInvestorSubscriptions({
      subs: [sub('s1', '2026-09-05'), sub('s2', '2027-01-08', 8_000)],
      ownerId: 'yannick',
      ownerActions: [call('2026-09-01')],
    });
    expect(res.map((r) => r.credited)).toEqual([true, false]);
    expect(res[1]?.kind).toBeNull();
    expect(res[1]?.explanation).toMatch(/30 jours/);
  });

  test('appel relationnel moins de 30 jours avant un réinvestissement → crédité', () => {
    const res = creditInvestorSubscriptions({
      subs: [sub('s1', '2026-09-05'), sub('s2', '2026-12-10', 8_000)],
      ownerId: 'yannick',
      ownerActions: [call('2026-09-01'), call('2026-11-20')],
    });
    expect(res[1]?.credited).toBe(true);
    expect(res[1]?.kind).toBe('follow_up');
    expect(res[1]?.explanation).toBe('Réinvestissement · appel joint J-20');
  });

  test('première souscription : fenêtre de 90 jours après la dernière action', () => {
    const inWindow = creditInvestorSubscriptions({
      subs: [sub('s1', '2026-10-20')],
      ownerId: 'c',
      ownerActions: [call('2026-09-01', false)],
    });
    expect(inWindow[0]?.credited).toBe(true);
    expect(inWindow[0]?.explanation).toBe('1re souscription · appel J-49');

    const outOfWindow = creditInvestorSubscriptions({
      subs: [sub('s1', '2026-12-15')],
      ownerId: 'c',
      ownerActions: [call('2026-09-01')],
    });
    expect(outOfWindow[0]?.credited).toBe(false);
    expect(outOfWindow[0]?.explanation).toMatch(/90 jours/);
  });

  test('un ancien investisseur : la première souscription APRÈS le contact vaut première', () => {
    const res = creditInvestorSubscriptions({
      subs: [sub('old', '2025-03-01'), sub('s1', '2026-10-01'), sub('s2', '2026-11-25')],
      ownerId: 'c',
      ownerActions: [call('2026-09-01')],
    });
    expect(res.map((r) => [r.subId, r.credited, r.kind])).toEqual([
      ['old', false, null],
      ['s1', true, 'first'],
      ['s2', false, null], // 85 jours après la seule action : suivante, fenêtre 30 j
    ]);
    expect(res[0]?.explanation).toBe('Signée avant ta première action.');
  });

  test('sans propriétaire ou sans action, rien n’est crédité', () => {
    expect(
      creditInvestorSubscriptions({
        subs: [sub('s1', '2026-09-05')],
        ownerId: null,
        ownerActions: [],
      })[0]?.credited,
    ).toBe(false);
    expect(
      creditInvestorSubscriptions({
        subs: [sub('s1', '2026-09-05')],
        ownerId: 'c',
        ownerActions: [],
      })[0]?.credited,
    ).toBe(false);
  });

  test('un SMS ou un mail tracé compte comme une action', () => {
    const res = creditInvestorSubscriptions({
      subs: [sub('s1', '2026-09-03')],
      ownerId: 'c',
      ownerActions: [{ at: day('2026-09-01'), kind: 'sms' }],
    });
    expect(res[0]?.credited).toBe(true);
    expect(res[0]?.explanation).toBe('1re souscription · SMS J-2');
  });

  test('l’ordre d’entrée des souscriptions et des actions est sans importance', () => {
    const res = creditInvestorSubscriptions({
      subs: [sub('s2', '2026-12-10'), sub('s1', '2026-09-05')],
      ownerId: 'c',
      ownerActions: [call('2026-11-20'), call('2026-09-01')],
    });
    expect(res.map((r) => r.subId)).toEqual(['s1', 's2']);
    expect(res.every((r) => r.credited)).toBe(true);
  });

  test('libellés « le jour même » et « la veille »', () => {
    const same = creditInvestorSubscriptions({
      subs: [{ id: 's', signedAt: new Date('2026-09-01T15:00:00Z'), amountEur: 1 }],
      ownerId: 'c',
      ownerActions: [call('2026-09-01')],
    });
    expect(same[0]?.explanation).toBe('1re souscription · appel joint le jour même');
    const eve = creditInvestorSubscriptions({
      subs: [sub('s', '2026-09-02')],
      ownerId: 'c',
      ownerActions: [call('2026-09-01')],
    });
    expect(eve[0]?.explanation).toBe('1re souscription · appel joint la veille');
  });
});

describe('creditEvent — progressions KYC / profil', () => {
  test('crédité si une action du propriétaire précède dans les 90 jours', () => {
    const res = creditEvent(day('2026-09-10'), [call('2026-09-01')]);
    expect(res.credited).toBe(true);
    expect(res.daysBefore).toBe(9);
  });
  test('pas crédité sans action avant, ou trop loin', () => {
    expect(creditEvent(day('2026-09-10'), [call('2026-09-12')]).credited).toBe(false);
    expect(creditEvent(day('2026-12-31'), [call('2026-09-01')]).credited).toBe(false);
  });
});

describe('creditActionKind', () => {
  test('traduit les types d’interaction', () => {
    expect(creditActionKind('call_outbound')).toBe('call');
    expect(creditActionKind('sms_sent')).toBe('sms');
    expect(creditActionKind('email_sent')).toBe('email');
    expect(creditActionKind('meeting_done')).toBe('rdv');
    expect(creditActionKind('note_added', 'rdv_outcome')).toBe('rdv');
    expect(creditActionKind('note_added')).toBeNull();
    expect(creditActionKind('email_opened')).toBeNull();
  });
});
