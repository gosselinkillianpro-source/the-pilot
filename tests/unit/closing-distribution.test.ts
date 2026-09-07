import { describe, expect, test } from 'vitest';
import {
  DISTRIBUTION_WINDOW_DAYS,
  deadlineLabel,
  hoursUntilRedistribution,
  isFreshDistributedLead,
  isStaleAssignment,
  pickNextCloser,
  REDISTRIBUTION_AFTER_HOURS,
  redistributionDeadline,
} from '@/lib/closing/distribution';

const NOW = new Date('2026-09-07T10:00:00Z');
const H = 3_600_000;

describe('rotation — le moins récemment servi', () => {
  const closers = [
    { id: 'dimitri', name: 'Dimitri', lastLeadDistributedAt: new Date('2026-09-07T09:00:00Z') },
    { id: 'alex', name: 'Alexandre', lastLeadDistributedAt: new Date('2026-09-07T08:00:00Z') },
    { id: 'yannick', name: 'Yannick', lastLeadDistributedAt: null },
  ];

  test('un closer jamais servi passe en premier', () => {
    expect(pickNextCloser(closers)?.id).toBe('yannick');
  });

  test('puis le plus ancien servi', () => {
    expect(pickNextCloser(closers, ['yannick'])?.id).toBe('alex');
  });

  test('égalité → ordre alphabétique, donc déterministe', () => {
    const same = new Date('2026-09-07T08:00:00Z');
    const tie = [
      { id: 'b', name: 'Yannick', lastLeadDistributedAt: same },
      { id: 'a', name: 'Alexandre', lastLeadDistributedAt: same },
    ];
    expect(pickNextCloser(tie)?.id).toBe('a');
  });

  test('personne d’éligible → null (le lead reste où il est)', () => {
    expect(pickNextCloser([])).toBeNull();
    expect(pickNextCloser(closers, ['dimitri', 'alex', 'yannick'])).toBeNull();
  });

  test('simulation : trois leads d’affilée font le tour', () => {
    const rotation = closers.map((c) => ({ ...c }));
    const served: string[] = [];
    for (let i = 0; i < 3; i++) {
      const next = pickNextCloser(rotation);
      if (!next) throw new Error('rotation vide');
      served.push(next.id);
      next.lastLeadDistributedAt = new Date(NOW.getTime() + i);
    }
    expect(served).toEqual(['yannick', 'alex', 'dimitri']);
  });
});

describe('reprise après 72 h sans action', () => {
  const assignedAt = new Date(NOW.getTime() - 72 * H);

  test('les réglages : 72 h, fenêtre 7 jours', () => {
    expect(REDISTRIBUTION_AFTER_HOURS).toBe(72);
    expect(DISTRIBUTION_WINDOW_DAYS).toBe(7);
    expect(redistributionDeadline(assignedAt).getTime()).toBe(NOW.getTime());
  });

  test('délai écoulé, aucune action : repris', () => {
    expect(isStaleAssignment({ assignedAt, lastOwnerActionAt: null }, NOW)).toBe(true);
  });

  test('délai écoulé mais une action depuis l’attribution : il garde la personne', () => {
    const acted = new Date(assignedAt.getTime() + 2 * H);
    expect(isStaleAssignment({ assignedAt, lastOwnerActionAt: acted }, NOW)).toBe(false);
  });

  test('une action AVANT l’attribution ne compte pas (fiche redistribuée)', () => {
    const before = new Date(assignedAt.getTime() - H);
    expect(isStaleAssignment({ assignedAt, lastOwnerActionAt: before }, NOW)).toBe(true);
  });

  test('délai pas encore écoulé : rien ne bouge', () => {
    const recent = new Date(NOW.getTime() - 71 * H);
    expect(isStaleAssignment({ assignedAt: recent, lastOwnerActionAt: null }, NOW)).toBe(false);
  });
});

describe('« nouveau lead à toi »', () => {
  const assignedAt = new Date(NOW.getTime() - 5 * H);
  test('réparti, rien fait depuis : oui, avec le compte à rebours', () => {
    expect(
      isFreshDistributedLead({
        assignmentSource: 'distribution',
        assignedAt,
        lastActivityAt: null,
        hasNextTask: false,
      }),
    ).toBe(true);
    expect(hoursUntilRedistribution(assignedAt, NOW)).toBe(67);
    expect(deadlineLabel(assignedAt, NOW)).toBe('encore 67 h');
  });

  test('redistribué : l’activité de l’ancien closer, antérieure, ne compte pas', () => {
    expect(
      isFreshDistributedLead({
        assignmentSource: 'redistribution',
        assignedAt,
        lastActivityAt: new Date(assignedAt.getTime() - H),
        hasNextTask: false,
      }),
    ).toBe(true);
  });

  test('dès une activité ou une action planifiée : ce n’est plus un nouveau lead', () => {
    expect(
      isFreshDistributedLead({
        assignmentSource: 'distribution',
        assignedAt,
        lastActivityAt: new Date(assignedAt.getTime() + H),
        hasNextTask: false,
      }),
    ).toBe(false);
    expect(
      isFreshDistributedLead({
        assignmentSource: 'distribution',
        assignedAt,
        lastActivityAt: null,
        hasNextTask: true,
      }),
    ).toBe(false);
  });

  test('attribué par un appel ou un code CGP : pas concerné', () => {
    expect(
      isFreshDistributedLead({
        assignmentSource: 'cgp',
        assignedAt,
        lastActivityAt: null,
        hasNextTask: false,
      }),
    ).toBe(false);
  });

  test('le libellé du délai dépassé', () => {
    const old = new Date(NOW.getTime() - 75 * H);
    expect(deadlineLabel(old, NOW)).toBe('en retard de 3 h');
    expect(deadlineLabel(new Date(NOW.getTime() - 72 * H + 20 * 60_000), NOW)).toBe(
      "moins d'une heure",
    );
  });
});
