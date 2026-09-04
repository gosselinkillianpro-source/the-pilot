/**
 * Crédit d'une souscription (et des progressions KYC / profil) à un closer.
 *
 * Règle décidée par Killian le 4 septembre 2026 — elle remplace « le dernier
 * appel dans les 30 jours » (l'ancien attribution.ts, supprimé) :
 *
 *   1. Le crédit va au PROPRIÉTAIRE de la personne (`assigned_closer_id`),
 *      jamais à un autre closer, jamais à un e-mail marketing.
 *   2. La PREMIÈRE souscription après le premier contact du propriétaire lui
 *      est créditée tant qu'il a eu une action dans les 90 jours avant la
 *      signature. 90 jours, c'est le délai au bout duquel un lead sans action
 *      revient au pool : « encore ton client » et « crédité » coïncident.
 *   3. Les souscriptions SUIVANTES ne lui sont créditées que s'il a eu une
 *      action (appel, SMS, mail, WhatsApp, RDV, proposition) dans les 30 jours
 *      avant la signature. Exemple de Killian : appel le 1er, 10 000 € le 5 →
 *      crédités ; plus aucun contact, réinvestissement 4 mois plus tard → pas
 *      crédité ; appel relationnel moins de 30 jours avant → crédité.
 *
 * Un « ancien » investisseur (qui a investi avant tout contact) suit la même
 * règle : sa première souscription APRÈS le contact vaut « première ».
 *
 * Module pur : aucune base, aucune date « maintenant ». Les requêtes
 * (`queries/credit-data.ts`) ne font que l'alimenter.
 */

export type CreditActionKind = 'call' | 'sms' | 'email' | 'whatsapp' | 'rdv' | 'proposal';

export type CreditAction = {
  at: Date;
  kind: CreditActionKind;
  /** Appel joint (résultat `reached`) — n'influe pas sur la règle, sert au libellé. */
  reached?: boolean;
};

/** Fenêtre de la première souscription = délai de retour au pool. */
export const FIRST_SUBSCRIPTION_WINDOW_DAYS = 90;
/** Fenêtre des souscriptions suivantes (réinvestissements). */
export const FOLLOW_UP_WINDOW_DAYS = 30;
/** Fenêtre des progressions (profil complété, KYC validé). */
export const PROGRESS_WINDOW_DAYS = 90;

/** Types d'interaction qui valent une action du closer (pour les requêtes). */
export const CREDIT_ACTION_TYPES = [
  'call_outbound',
  'call_inbound',
  'sms_sent',
  'email_sent',
  'whatsapp_sent',
  'meeting_booked',
  'meeting_done',
  'proposal_sent',
] as const;

/** Compte-rendu de RDV (interaction `note_added` avec ce `metadata.kind`). */
export const RDV_NOTE_KIND = 'rdv_outcome';

/** Traduit un type d'interaction en nature d'action ; null si ça ne compte pas. */
export function creditActionKind(type: string, metaKind?: string | null): CreditActionKind | null {
  if (type === 'call_outbound' || type === 'call_inbound') return 'call';
  if (type === 'sms_sent') return 'sms';
  if (type === 'email_sent') return 'email';
  if (type === 'whatsapp_sent') return 'whatsapp';
  if (type === 'meeting_booked' || type === 'meeting_done') return 'rdv';
  if (type === 'proposal_sent') return 'proposal';
  if (type === 'note_added' && metaKind === RDV_NOTE_KIND) return 'rdv';
  return null;
}

export type CreditableSub = { id: string; signedAt: Date; amountEur: number };

export type SubCreditKind = 'first' | 'follow_up';

export type SubCredit = {
  subId: string;
  credited: boolean;
  /** Le propriétaire crédité, null si personne. */
  closerId: string | null;
  kind: SubCreditKind | null;
  /** L'action qui justifie le crédit : la dernière avant la signature. */
  action: CreditAction | null;
  /** Jours entre cette action et la signature. */
  daysBefore: number | null;
  /** Phrase montrée au closer — un chiffre sans explication ne vaut rien. */
  explanation: string;
};

const DAY_MS = 86_400_000;

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export function actionLabel(action: CreditAction): string {
  switch (action.kind) {
    case 'call':
      return action.reached ? 'appel joint' : 'appel';
    case 'sms':
      return 'SMS';
    case 'email':
      return 'mail';
    case 'whatsapp':
      return 'WhatsApp';
    case 'rdv':
      return 'RDV';
    case 'proposal':
      return 'proposition';
  }
}

function whenLabel(days: number): string {
  if (days <= 0) return 'le jour même';
  if (days === 1) return 'la veille';
  return `J-${days}`;
}

/**
 * Crédite (ou non) chaque souscription d'UN investisseur à son propriétaire.
 *
 * @param subs toutes les souscriptions non annulées et signées de la personne,
 *             dans n'importe quel ordre.
 * @param ownerId propriétaire actuel (`assigned_closer_id`), null si libre.
 * @param ownerActions actions du propriétaire sur cette personne, tout l'historique.
 */
export function creditInvestorSubscriptions(input: {
  subs: CreditableSub[];
  ownerId: string | null;
  ownerActions: CreditAction[];
}): SubCredit[] {
  const subs = [...input.subs].sort((a, b) => a.signedAt.getTime() - b.signedAt.getTime());
  const actions = [...input.ownerActions].sort((a, b) => a.at.getTime() - b.at.getTime());
  const ownerId = input.ownerId;

  const none = (sub: CreditableSub, explanation: string): SubCredit => ({
    subId: sub.id,
    credited: false,
    closerId: null,
    kind: null,
    action: null,
    daysBefore: null,
    explanation,
  });

  if (!ownerId) return subs.map((s) => none(s, 'Personne sans closer attitré.'));
  const firstAction = actions[0];
  if (!firstAction) return subs.map((s) => none(s, 'Aucune action du closer avant la signature.'));

  // La « première » souscription : la plus ancienne signée après le premier
  // contact du propriétaire. Les précédentes datent d'avant lui.
  const firstAfterLink = subs.find((s) => s.signedAt.getTime() >= firstAction.at.getTime());

  return subs.map((sub) => {
    const lastAction = [...actions].reverse().find((a) => a.at.getTime() <= sub.signedAt.getTime());
    if (!lastAction) return none(sub, 'Signée avant ta première action.');

    const days = daysBetween(lastAction.at, sub.signedAt);
    const isFirst = firstAfterLink?.id === sub.id;
    const window = isFirst ? FIRST_SUBSCRIPTION_WINDOW_DAYS : FOLLOW_UP_WINDOW_DAYS;
    const label = actionLabel(lastAction);

    if (days > window) {
      return {
        subId: sub.id,
        credited: false,
        closerId: null,
        kind: null,
        action: lastAction,
        daysBefore: days,
        explanation: isFirst
          ? `Plus de ${window} jours après ta dernière action (${label} ${whenLabel(days)}).`
          : `Réinvestissement sans action de ta part dans les ${window} jours avant (dernière : ${label} ${whenLabel(days)}).`,
      };
    }

    return {
      subId: sub.id,
      credited: true,
      closerId: ownerId,
      kind: isFirst ? 'first' : 'follow_up',
      action: lastAction,
      daysBefore: days,
      explanation: isFirst
        ? `1re souscription · ${label} ${whenLabel(days)}`
        : `Réinvestissement · ${label} ${whenLabel(days)}`,
    };
  });
}

export type EventCredit = {
  credited: boolean;
  action: CreditAction | null;
  daysBefore: number | null;
};

/**
 * Crédite une progression datée (profil complété, KYC validé) au propriétaire
 * s'il a eu une action dans la fenêtre avant l'événement.
 */
export function creditEvent(
  eventAt: Date,
  ownerActions: CreditAction[],
  windowDays: number = PROGRESS_WINDOW_DAYS,
): EventCredit {
  const before = ownerActions
    .filter((a) => a.at.getTime() <= eventAt.getTime())
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const last = before[0];
  if (!last) return { credited: false, action: null, daysBefore: null };
  const days = daysBetween(last.at, eventAt);
  return { credited: days <= windowDays, action: last, daysBefore: days };
}
