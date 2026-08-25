import { describe, expect, test } from 'vitest';
import {
  ALL_STAGES,
  advanceStage,
  isWebinarStage,
  STAGES,
  stageAfterCall,
  stageColumn,
} from '@/lib/webinars/pipeline';

describe('colonnes du tableau de suivi', () => {
  test('six colonnes, dans l’ordre du parcours', () => {
    expect(ALL_STAGES).toEqual([
      'taken',
      'called',
      'interested',
      'account_ready',
      'invested',
      'lost',
    ]);
  });

  test('chaque colonne a un libellé et une explication', () => {
    for (const c of STAGES) {
      expect(c.label.trim().length).toBeGreaterThan(0);
      expect(c.hint.trim().length).toBeGreaterThan(0);
    }
  });

  test('reconnaît une colonne valide et rejette le reste', () => {
    expect(isWebinarStage('interested')).toBe(true);
    expect(isWebinarStage('nimporte_quoi')).toBe(false);
  });

  test('retrouve une colonne par son identifiant', () => {
    expect(stageColumn('invested').label).toBe('A investi');
  });
});

describe('avancement automatique', () => {
  test('crée la carte quand la personne n’était pas suivie', () => {
    expect(advanceStage(null, 'taken')).toBe('taken');
  });

  test('avance vers la droite', () => {
    expect(advanceStage('taken', 'called')).toBe('called');
  });

  test('ne fait jamais reculer une carte', () => {
    // Le closer a classé la personne « Intéressé » : un nouvel appel
    // enregistré ne doit pas la ramener dans « Appelé ».
    expect(advanceStage('interested', 'called')).toBeNull();
    expect(advanceStage('account_ready', 'taken')).toBeNull();
  });

  test('ne touche pas une carte déjà tranchée par un humain', () => {
    expect(advanceStage('invested', 'called')).toBeNull();
    expect(advanceStage('lost', 'called')).toBeNull();
  });

  test('ne rejoue pas une colonne déjà en place', () => {
    expect(advanceStage('called', 'called')).toBeNull();
  });
});

describe('appel enregistré', () => {
  test('un premier appel fait entrer la personne dans « Appelé »', () => {
    expect(stageAfterCall(null, 'no_answer')).toBe('called');
    expect(stageAfterCall('taken', 'reached')).toBe('called');
  });

  test('« pas de réponse » ne perd personne : la relance reste à faire', () => {
    expect(stageAfterCall('taken', 'no_answer')).toBe('called');
  });

  test('profil incompatible et mauvais numéro ferment la ligne', () => {
    expect(stageAfterCall('called', 'profile_incompatible')).toBe('lost');
    expect(stageAfterCall(null, 'wrong_number')).toBe('lost');
  });

  test('une personne qui a investi n’est jamais reclassée perdue par un appel', () => {
    expect(stageAfterCall('invested', 'profile_incompatible')).toBeNull();
  });

  test('un second appel ne fait pas reculer une carte avancée', () => {
    expect(stageAfterCall('account_ready', 'reached')).toBeNull();
  });
});
