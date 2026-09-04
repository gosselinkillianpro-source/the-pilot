/** Libellés français des événements du journal d'un lead. */
export const EVENT_LABELS: Record<string, string> = {
  received: 'Lead reçu',
  duplicate: 'Doublon détecté (même téléphone sous 30 jours)',
  answers_updated: 'Réponses du diagnostic complétées',
  call_started: 'Appel lancé',
  attempt_missed: 'Sans réponse',
  callback_later: 'Rappel convenu',
  callback_due: 'Heure du rappel convenu',
  callback_requested: 'Créneau choisi par le lead (lien SMS)',
  nurture: 'Mis à nourrir',
  out_of_target: 'Hors cible',
  qualified: 'Qualifié',
  rdv_posed: 'Rendez-vous posé',
  reopened: 'Réouvert',
  honored: 'Rendez-vous honoré',
  absent: 'Absent au rendez-vous',
  rescheduled: 'Reprogrammé',
  rdv_reposed: 'Nouveau rendez-vous posé',
  conform: 'Conforme',
  non_conform: 'Non conforme',
  return_accepted: 'Retour accepté',
  return_refused: 'Retour refusé',
  outcome_in_progress: 'Suite : en cours',
  outcome_signed: 'Signé',
  outcome_lost: 'Perdu',
  reschedule_requested: 'Replanification demandée par le lead',
  validation: 'Validation de l’acheteur',
};

export const ACTOR_LABELS: Record<string, string> = {
  system: 'Système',
  setter: 'Setter',
  buyer: 'Acheteur',
  admin: 'Admin',
};

export const NURTURE_LABELS: Record<string, string> = {
  curiosite: 'Se renseigne seulement',
  montant_sous_seuil: 'Montant sous le seuil',
  pas_maintenant: 'Pas maintenant',
};

export const HORS_CIBLE_LABELS: Record<string, string> = {
  doublon: 'Doublon',
  faux_numero: 'Faux numéro',
  montant_hors_criteres: 'Montant hors critères',
  timing_hors_criteres: 'Timing hors critères',
  hors_zone: 'Hors zone',
  deja_client: 'Déjà client',
  pas_interesse: 'Pas intéressé',
  autre: 'Autre',
};

export const CALL_OUTCOME_LABELS: Record<string, string> = {
  repondu: 'Répondu',
  messagerie: 'Messagerie',
  occupe: 'Occupé',
  faux_numero: 'Faux numéro',
};
