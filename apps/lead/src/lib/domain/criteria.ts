import type { BuyerCriteria, CriteriaChecks } from '@/lib/db/schema';
import { atLeast, atMost, labelFor } from './answers/mep';

/**
 * Critères d'un acheteur confrontés aux réponses du lead (section 4.5) et aux
 * cases cochées par le setter (section 4.3). Le calcul est fait côté serveur
 * pour que la fiche et le routage racontent la même histoire.
 *
 * Trois valeurs par critère : `true` (oui), `false` (non), `null` (non vérifié).
 * Le setter a toujours le dernier mot sur l'évaluation automatique.
 */

export type CriterionKey =
  | 'montant_min'
  | 'objectifs'
  | 'timing_max'
  | 'impot_min'
  | 'patrimoine_min'
  | 'age'
  | 'zones'
  | 'exclusions';

export type CriterionEvaluation = {
  key: CriterionKey;
  label: string;
  /** Ce que disent les réponses du formulaire, sans intervention humaine. */
  auto: boolean | null;
  mandatory: boolean;
};

export const CRITERION_LABELS: Record<CriterionKey, string> = {
  montant_min: 'Montant minimum',
  objectifs: 'Objectif dans la cible',
  timing_max: 'Timing acceptable',
  impot_min: 'Impôt minimum',
  patrimoine_min: 'Patrimoine minimum',
  age: 'Tranche d’âge',
  zones: 'Zone géographique',
  exclusions: 'Aucune exclusion',
};

function describe(criteria: BuyerCriteria, key: CriterionKey): string {
  switch (key) {
    case 'montant_min':
      return `${CRITERION_LABELS.montant_min} : ${labelFor('montant', criteria.montant_min)}`;
    case 'objectifs':
      return `${CRITERION_LABELS.objectifs} : ${(criteria.objectifs ?? []).map((o) => labelFor('objectif', o)).join(', ')}`;
    case 'timing_max':
      return `${CRITERION_LABELS.timing_max} : au plus « ${labelFor('urgence', criteria.timing_max)} »`;
    case 'impot_min':
      return `${CRITERION_LABELS.impot_min} : ${labelFor('impot_annuel', criteria.impot_min)}`;
    case 'patrimoine_min':
      return `${CRITERION_LABELS.patrimoine_min} : ${labelFor('patrimoine', criteria.patrimoine_min)}`;
    case 'age':
      return `${CRITERION_LABELS.age} : ${(criteria.age ?? []).map((a) => labelFor('age', a)).join(', ')}`;
    case 'zones':
      return `${CRITERION_LABELS.zones} : ${(criteria.zones ?? []).join(', ')}`;
    case 'exclusions':
      return CRITERION_LABELS.exclusions;
  }
}

/** Les critères réellement configurés chez cet acheteur, dans un ordre stable. */
export function configuredCriteria(criteria: BuyerCriteria): CriterionKey[] {
  const keys: CriterionKey[] = [];
  if (criteria.montant_min) keys.push('montant_min');
  if (criteria.objectifs?.length) keys.push('objectifs');
  if (criteria.timing_max) keys.push('timing_max');
  if (criteria.impot_min) keys.push('impot_min');
  if (criteria.patrimoine_min) keys.push('patrimoine_min');
  if (criteria.age?.length) keys.push('age');
  if (criteria.zones?.length) keys.push('zones');
  if (criteria.exclusions && Object.keys(criteria.exclusions).length) keys.push('exclusions');
  return keys;
}

function evaluateOne(
  key: CriterionKey,
  criteria: BuyerCriteria,
  answers: Record<string, string>,
): boolean | null {
  switch (key) {
    case 'montant_min':
      return atLeast('montant', answers.montant, criteria.montant_min ?? '');
    case 'objectifs':
      return answers.objectif ? (criteria.objectifs ?? []).includes(answers.objectif) : null;
    case 'timing_max':
      return atMost('urgence', answers.urgence, criteria.timing_max ?? '');
    case 'impot_min':
      // « inconnu » ne permet pas de trancher : non vérifié.
      return atLeast('impot_annuel', answers.impot_annuel, criteria.impot_min ?? '');
    case 'patrimoine_min':
      return atLeast('patrimoine', answers.patrimoine, criteria.patrimoine_min ?? '');
    case 'age':
      return answers.age ? (criteria.age ?? []).includes(answers.age) : null;
    case 'zones':
      // Le formulaire ne demande pas la zone : toujours à vérifier au téléphone.
      return null;
    case 'exclusions': {
      const ex = criteria.exclusions ?? {};
      let known = false;
      for (const [k, banned] of Object.entries(ex)) {
        const v = answers[k];
        if (v === undefined) continue;
        known = true;
        if (banned.includes(v)) return false;
      }
      return known ? true : null;
    }
  }
}

export function evaluateBuyerCriteria(
  criteria: BuyerCriteria,
  answers: Record<string, string>,
): CriterionEvaluation[] {
  return configuredCriteria(criteria).map((key) => ({
    key,
    label: describe(criteria, key),
    auto: evaluateOne(key, criteria, answers),
    mandatory: criteria.obligatoires.includes(key),
  }));
}

/** Valeur finale d'un critère : le setter (oui/non) l'emporte sur l'automatique. */
export function finalCheck(
  auto: boolean | null,
  setter: CriteriaChecks,
  key: string,
): boolean | null {
  const s = setter[key];
  if (s === true || s === false) return s;
  return auto;
}

export type BuyerQualification = {
  buyerId: string;
  qualified: boolean;
  /** Nombre de critères obligatoires à « oui ». */
  score: number;
  mandatoryTotal: number;
  evaluations: (CriterionEvaluation & { final: boolean | null })[];
};

/** Un lead est qualifié pour un acheteur si TOUS ses critères obligatoires sont à « oui ». */
export function qualifyForBuyer(
  buyerId: string,
  criteria: BuyerCriteria,
  answers: Record<string, string>,
  setterChecks: CriteriaChecks,
): BuyerQualification {
  const evaluations = evaluateBuyerCriteria(criteria, answers).map((e) => ({
    ...e,
    final: finalCheck(e.auto, setterChecks, e.key),
  }));
  const mandatory = evaluations.filter((e) => e.mandatory);
  const score = mandatory.filter((e) => e.final === true).length;
  return {
    buyerId,
    // Aucun critère obligatoire configuré = pas de contrainte : routable.
    qualified: score === mandatory.length,
    score,
    mandatoryTotal: mandatory.length,
    evaluations,
  };
}

export type UnionCriterion = {
  key: CriterionKey;
  label: string;
  auto: boolean | null;
  /** Obligatoire pour au moins un acheteur actif. */
  mandatoryFor: string[];
};

/**
 * Union des critères des acheteurs actifs de la source, pour la fiche d'appel :
 * une case par critère, avec les acheteurs pour qui il est obligatoire.
 */
export function unionCriteria(
  buyers: { id: string; name: string; criteria: BuyerCriteria }[],
  answers: Record<string, string>,
): UnionCriterion[] {
  const map = new Map<CriterionKey, UnionCriterion>();
  for (const b of buyers) {
    for (const e of evaluateBuyerCriteria(b.criteria, answers)) {
      const existing = map.get(e.key);
      if (existing) {
        if (e.mandatory) existing.mandatoryFor.push(b.name);
        // Deux acheteurs avec le même critère mais des seuils différents :
        // on retient l'évaluation la plus exigeante (un « non » l'emporte).
        if (e.auto === false) existing.auto = false;
        else if (e.auto === null && existing.auto === true) existing.auto = null;
      } else {
        map.set(e.key, {
          key: e.key,
          label: e.label,
          auto: e.auto,
          mandatoryFor: e.mandatory ? [b.name] : [],
        });
      }
    }
  }
  return [...map.values()];
}
