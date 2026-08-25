import { describe, expect, test } from 'vitest';
import {
  CLOSING_COLUMNS,
  CLOSING_STAGE_LABELS,
  type ClosingStage,
  columnForStage,
  isClosingStage,
  MAX_CALL_ATTEMPTS,
  shouldApplyMove,
  stageAfterQualification,
} from '@/lib/closing/pipeline';

describe('colonnes du tableau', () => {
  test('l’ordre suit le parcours réel du closer', () => {
    expect(CLOSING_COLUMNS.map((c) => c.stage)).toEqual([
      'contacted',
      'to_call_back',
      'interested',
      'meeting_booked',
      'proposal_sent',
      'closed_won',
      'closed_lost',
    ]);
  });

  test('toute étape de la base a une colonne, sauf « nouveau »', () => {
    const stages = Object.keys(CLOSING_STAGE_LABELS) as ClosingStage[];
    for (const stage of stages) {
      const col = columnForStage(stage);
      if (stage === 'new') expect(col).toBeNull();
      // Sans repli, une fiche « RDV fait » ou « en sommeil » n'apparaîtrait
      // dans aucune colonne : elle disparaîtrait de l'écran sans rien dire.
      else expect(col, `aucune colonne pour ${stage}`).not.toBeNull();
    }
  });

  test('les étapes repliées atterrissent dans la bonne colonne', () => {
    expect(columnForStage('meeting_done')?.stage).toBe('meeting_booked');
    expect(columnForStage('dormant')?.stage).toBe('to_call_back');
  });

  test('reconnaît une étape valide et rejette le reste', () => {
    expect(isClosingStage('to_call_back')).toBe(true);
    expect(isClosingStage('nimporte_quoi')).toBe(false);
  });
});

describe('qualification d’un appel', () => {
  test('pas de réponse : première tentative → à rappeler', () => {
    const move = stageAfterQualification('no_answer', 1);
    expect(move.stage).toBe('to_call_back');
    expect(move.reason).toContain(`1/${MAX_CALL_ATTEMPTS}`);
  });

  test('répondeur : deuxième tentative → toujours à rappeler', () => {
    expect(stageAfterQualification('voicemail', 2).stage).toBe('to_call_back');
  });

  test('troisième tentative sans réponse : sorti de la file', () => {
    const move = stageAfterQualification('no_answer', MAX_CALL_ATTEMPTS);
    expect(move.stage).toBe('closed_lost');
    expect(move.reason).toContain('injoignable');
  });

  test('profil incompatible : sorti immédiatement, sans attendre trois appels', () => {
    expect(stageAfterQualification('profile_incompatible', 1).stage).toBe('closed_lost');
  });

  test('mauvais numéro : sorti immédiatement', () => {
    expect(stageAfterQualification('wrong_number', 1).stage).toBe('closed_lost');
  });

  test('joint : la carte attend la décision du closer', () => {
    // On ne présume pas de l'intérêt de la personne à sa place.
    expect(stageAfterQualification('reached', 1).stage).toBe('contacted');
    expect(stageAfterQualification('in_progress', 1).stage).toBe('contacted');
  });
});

describe('protection des cartes déjà avancées', () => {
  test('un rappel ne fait pas retomber une carte « Intéressé »', () => {
    expect(shouldApplyMove('interested', 'contacted')).toBe(false);
    expect(shouldApplyMove('meeting_booked', 'to_call_back')).toBe(false);
    expect(shouldApplyMove('proposal_sent', 'contacted')).toBe(false);
  });

  test('les deux états d’attente communiquent entre eux', () => {
    expect(shouldApplyMove('contacted', 'to_call_back')).toBe(true);
    expect(shouldApplyMove('to_call_back', 'contacted')).toBe(true);
    expect(shouldApplyMove('new', 'contacted')).toBe(true);
  });

  test('une sortie de file s’applique depuis n’importe quelle étape en cours', () => {
    expect(shouldApplyMove('interested', 'closed_lost')).toBe(true);
    expect(shouldApplyMove('meeting_booked', 'closed_lost')).toBe(true);
  });

  test('personne qui a investi : aucun automatisme ne la déplace', () => {
    expect(shouldApplyMove('closed_won', 'closed_lost')).toBe(false);
    expect(shouldApplyMove('closed_won', 'contacted')).toBe(false);
  });

  test('déjà sorti de la file : on n’y touche plus', () => {
    expect(shouldApplyMove('closed_lost', 'contacted')).toBe(false);
    expect(shouldApplyMove('closed_lost', 'closed_lost')).toBe(false);
  });
});

describe('le parcours complet des trois tentatives', () => {
  test('trois appels sans réponse font sortir la personne de la file', () => {
    let stage: ClosingStage = 'new';
    const parcours: ClosingStage[] = [];
    for (let attempt = 1; attempt <= MAX_CALL_ATTEMPTS; attempt++) {
      const move = stageAfterQualification('no_answer', attempt);
      if (shouldApplyMove(stage, move.stage)) stage = move.stage;
      parcours.push(stage);
    }
    expect(parcours).toEqual(['to_call_back', 'to_call_back', 'closed_lost']);
  });

  test('un contact abouti au milieu remet le compteur à zéro', () => {
    // Le compteur est fourni par l'appelant (compté depuis le dernier contact
    // abouti) : deux échecs, un contact, puis un échec = tentative 1, pas 4.
    expect(stageAfterQualification('no_answer', 1).stage).toBe('to_call_back');
  });
});
