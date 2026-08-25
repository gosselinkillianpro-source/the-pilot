/**
 * Attribution de la collecte à un webinaire.
 *
 * Règle métier (décision Killian, 25/08/2026) : un webinaire ne recrute pas
 * deux fois la même personne. Deux profils, deux traitements.
 *
 *   1. LA RECRUE — elle est arrivée sur Seven At Home par ce webinaire :
 *      inscrite au live, compte créé dans la foulée (jusqu'à 15 jours avant le
 *      live, et sans limite après). C'est le webinaire qui l'a fait entrer :
 *      TOUTES ses souscriptions lui reviennent, pendant des années. Même si
 *      elle suit d'autres webinaires ensuite, le crédit reste au premier.
 *
 *   2. LE MEMBRE DÉJÀ LÀ — compte antérieur, souvent apporté par un
 *      administrateur ou un CGP, et qui avait déjà déposé. Le webinaire a pu
 *      le réactiver (retargeting → live → souscription) : on lui accorde
 *      exactement UNE souscription, la première qui suit. Les suivantes ne
 *      doivent plus rien au webinaire.
 *
 * ⚠️ Ce que cette règle corrige. Sylvain Soniliacque, membre depuis mai 2025,
 * 29 souscriptions au compteur, 2 980 € placés AVANT le 17/08 : il a suivi le
 * live et remis 2 €. Ces 2 € sont bien au webinaire. Ses prochains dépôts, non.
 * Sans ce garde-fou, le webinaire du 08/08 s'attribuait les 3 souscriptions
 * postérieures de Stephane Madryga (membre depuis 2024, 37 souscriptions,
 * 16 194 € placés avant) — 57 € au lieu de 6 €, et le chiffre aurait continué
 * de grossir à chaque dépôt d'un client acquis deux ans plus tôt.
 *
 * ⚠️ BORNE DE LA RECRUE : compte créé au plus tôt 15 jours avant le premier
 * contact avec le webinaire (inscription au live, ou tenue du live si elle
 * manque), sans limite après. Ce n'est pas un délai symétrique, et c'est voulu :
 *   - côté AVANT, sur les données réelles du 17/08, serge passerat (40 000 €) et
 *     Claire Sibille (30 000 €) ont créé leur compte à 16h22 pour un live à
 *     17h00 — 38 minutes avant ; d'autres l'ouvrent 2 ou 3 jours avant, entre
 *     l'inscription et le live. Exiger « le jour J ou après » les classerait
 *     membres pré-existants et plafonnerait à une souscription des gens qui
 *     viennent tout juste d'entrer par ce webinaire ;
 *   - côté APRÈS, Claire Jamet a créé son compte 10,6 jours après le webinaire
 *     du 13/08 avant d'y placer 6 000 € : borner à 7 jours l'amputait de moitié.
 *
 * ⚠️ GARDE-FOU : avoir déjà souscrit AVANT le live disqualifie le statut de
 * recrue, même dans la fenêtre de 15 jours. Quelqu'un amené par un CGP dix
 * jours plus tôt et qui a déjà placé 50 000 € n'a pas été recruté par le
 * webinaire — il retombe dans le cas 2 (une seule souscription attribuée).
 * Aucun cas de ce type dans les données au 25/08/2026 : le garde-fou protège
 * l'avenir, il ne corrige rien aujourd'hui.
 *
 * Rattachement : une souscription n'entre ici que si son investisseur est relié
 * à une inscription au webinaire (`webinar_registrations.investor_id`, posé par
 * e-mail exact dans `sync.ts`). Pas d'inscription au live, pas d'attribution.
 *
 * Module volontairement pur (aucun accès base, aucune date « maintenant ») :
 * ces chiffres décident de la valeur d'un webinaire, ils doivent être
 * reproductibles par un test.
 */

/**
 * Antériorité tolérée entre la création du compte SAH et le premier contact
 * avec le webinaire. Au-delà, la personne était déjà installée sur la
 * plateforme : le webinaire ne l'a pas recrutée.
 */
export const RECRUIT_LOOKBACK_DAYS = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

export type AttributionWebinar = {
  id: string;
  /** Un webinaire sans date ne peut rien attribuer : il est écarté en amont. */
  scheduledAt: Date;
};

export type AttributionRegistration = {
  webinarId: string;
  investorId: string;
  /** Date d'inscription au live (WebinarGeek). Null = on retombe sur la date du live. */
  registeredAt: Date | null;
};

export type AttributionInvestor = {
  id: string;
  /** Création du compte Seven At Home. Sans elle, impossible de trancher : traité en membre déjà là. */
  sahCreatedAt: Date | null;
};

export type AttributionSubscription = {
  id: string;
  investorId: string;
  amount: number;
  /**
   * Date de référence : coalesce(signed_at, paid_at, created_at).
   * SAH ne renseigne pas toujours `signed_at` — exiger cette seule colonne
   * écartait 329 497 € EN SILENCE (voir le correctif du 24/08).
   */
  signedRef: Date;
};

export type AttributionInput = {
  webinars: AttributionWebinar[];
  registrations: AttributionRegistration[];
  investors: AttributionInvestor[];
  subscriptions: AttributionSubscription[];
};

/** Pourquoi une souscription est portée au crédit d'un webinaire. */
export type AttributionReason =
  /** La personne est entrée sur la plateforme par ce webinaire : tout lui revient. */
  | 'recruit'
  /** Membre déjà là : seule sa première souscription après le webinaire compte. */
  | 'first_after';

export type Attribution = {
  webinarId: string;
  subscriptionId: string;
  investorId: string;
  amount: number;
  reason: AttributionReason;
};

/** Statut d'un inscrit vis-à-vis DU webinaire affiché — sert à expliquer le chiffre à l'écran. */
export type RegistrationStatus =
  /** Recruté par CE webinaire. */
  | 'recruit'
  /** Compte antérieur à ce webinaire : une seule souscription lui sera attribuée. */
  | 'existing_member'
  /** Recruté par un AUTRE webinaire, qui garde tout son crédit : rien n'est attribué ici. */
  | 'recruited_elsewhere';

export type AttributionResult = {
  attributions: Attribution[];
  /** Webinaire d'entrée de chaque investisseur, quand il en a un. */
  recruiterByInvestor: Map<string, string>;
};

/** Premier contact connu avec le webinaire : l'inscription au live, ou le live lui-même. */
function firstContactAt(
  webinar: AttributionWebinar,
  registration: AttributionRegistration,
): number {
  const registered = registration.registeredAt?.getTime() ?? webinar.scheduledAt.getTime();
  return Math.min(registered, webinar.scheduledAt.getTime());
}

/**
 * Ce webinaire a-t-il fait entrer cette personne sur la plateforme ?
 *
 * Oui si son compte SAH a été créé autour de son premier contact avec le
 * webinaire — au plus tôt 15 jours avant, sans limite après — et qu'elle
 * n'avait encore rien souscrit quand le live a eu lieu.
 */
export function isRecruitedBy(
  investor: AttributionInvestor,
  webinar: AttributionWebinar,
  registration: AttributionRegistration,
  /** Souscriptions de cette personne, tous webinaires confondus. */
  subscriptions: readonly AttributionSubscription[] = [],
): boolean {
  if (!investor.sahCreatedAt) return false;
  const openedAt = investor.sahCreatedAt.getTime();
  if (openedAt < firstContactAt(webinar, registration) - RECRUIT_LOOKBACK_DAYS * DAY_MS)
    return false;
  // Un investisseur qui avait déjà placé de l'argent avant le live était déjà
  // client : le webinaire ne l'a pas recruté, il l'a relancé.
  return !subscriptions.some((s) => s.signedRef.getTime() <= webinar.scheduledAt.getTime());
}

/**
 * Attribue chaque souscription à AU PLUS un webinaire.
 *
 * Aucune souscription ne peut être comptée deux fois : c'est la garantie qui
 * permet d'additionner les collectes de plusieurs webinaires sans gonfler le
 * total.
 */
export function attributeSubscriptions(input: AttributionInput): AttributionResult {
  const investors = new Map(input.investors.map((i) => [i.id, i]));
  const webinars = new Map(input.webinars.map((w) => [w.id, w]));

  // Inscriptions par investisseur, du webinaire le plus ancien au plus récent :
  // l'ordre décide quel webinaire porte le recrutement (le premier contact).
  const regsByInvestor = new Map<
    string,
    { webinar: AttributionWebinar; reg: AttributionRegistration }[]
  >();
  for (const reg of input.registrations) {
    const webinar = webinars.get(reg.webinarId);
    if (!webinar) continue;
    const list = regsByInvestor.get(reg.investorId) ?? [];
    list.push({ webinar, reg });
    regsByInvestor.set(reg.investorId, list);
  }
  for (const list of regsByInvestor.values()) {
    list.sort((a, b) => a.webinar.scheduledAt.getTime() - b.webinar.scheduledAt.getTime());
  }

  // Souscriptions par investisseur, de la plus ancienne à la plus récente :
  // « la première après le webinaire » n'a de sens que sur une liste triée.
  const subsByInvestor = new Map<string, AttributionSubscription[]>();
  for (const sub of input.subscriptions) {
    const list = subsByInvestor.get(sub.investorId) ?? [];
    list.push(sub);
    subsByInvestor.set(sub.investorId, list);
  }
  for (const list of subsByInvestor.values()) {
    list.sort((a, b) => a.signedRef.getTime() - b.signedRef.getTime());
  }

  const attributions: Attribution[] = [];
  const recruiterByInvestor = new Map<string, string>();

  for (const [investorId, regs] of regsByInvestor) {
    const investor = investors.get(investorId);
    if (!investor) continue;
    const subs = subsByInvestor.get(investorId) ?? [];

    const entry = regs.find(({ webinar, reg }) => isRecruitedBy(investor, webinar, reg, subs));
    if (entry) recruiterByInvestor.set(investorId, entry.webinar.id);
    if (subs.length === 0) continue;

    // Recrue : tout ce qu'elle souscrit après son webinaire d'entrée lui revient,
    // sans limite de temps et sans partage avec les webinaires suivants.
    if (entry) {
      const since = entry.webinar.scheduledAt.getTime();
      for (const sub of subs) {
        if (sub.signedRef.getTime() <= since) continue;
        attributions.push({
          webinarId: entry.webinar.id,
          subscriptionId: sub.id,
          investorId,
          amount: sub.amount,
          reason: 'recruit',
        });
      }
      continue;
    }

    // Membre déjà là : une seule souscription par webinaire suivi, la première.
    // Quand la même souscription est « la première » de deux webinaires (deux
    // lives suivis avant un seul dépôt), elle revient au plus proche — sinon on
    // la compterait deux fois.
    const claimed = new Map<
      string,
      { webinar: AttributionWebinar; sub: AttributionSubscription }
    >();
    for (const { webinar } of regs) {
      const first = subs.find((s) => s.signedRef.getTime() > webinar.scheduledAt.getTime());
      if (!first) continue;
      const held = claimed.get(first.id);
      if (!held || webinar.scheduledAt.getTime() > held.webinar.scheduledAt.getTime()) {
        claimed.set(first.id, { webinar, sub: first });
      }
    }
    for (const { webinar, sub } of claimed.values()) {
      attributions.push({
        webinarId: webinar.id,
        subscriptionId: sub.id,
        investorId,
        amount: sub.amount,
        reason: 'first_after',
      });
    }
  }

  return { attributions, recruiterByInvestor };
}

/** Statut à afficher pour un inscrit sur la page d'UN webinaire. */
export function registrationStatus(
  webinarId: string,
  recruiterWebinarId: string | undefined,
): RegistrationStatus {
  if (!recruiterWebinarId) return 'existing_member';
  return recruiterWebinarId === webinarId ? 'recruit' : 'recruited_elsewhere';
}
