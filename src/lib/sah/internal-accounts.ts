/**
 * Comptes Seven At Home qui appartiennent à la maison, pas au marché.
 *
 * Le fondateur, le staff et les comptes de service ont de vraies fiches
 * investisseur côté SAH, avec de vraies souscriptions. Ils sont légitimes en
 * base — mais ils faussent toute mesure d'ACQUISITION : Stéphane Madryga,
 * cofondateur et présentateur des webinaires, s'inscrit à son propre live ;
 * ses 37 souscriptions ne mesurent pas l'efficacité du webinaire.
 *
 * Portée volontairement étroite : ces comptes sont exclus des chiffres
 * d'attribution (quel canal a rapporté quoi), PAS de la collecte totale ni des
 * listes de travail des closers — l'argent existe, il est juste sans mérite
 * marketing. Un compte interne reste donc visible à l'écran, signalé comme tel.
 *
 * Identification par `sah_id` plutôt que par e-mail : l'identifiant SAH est
 * stable, et on évite de coucher des adresses personnelles dans le dépôt.
 */

/** Comptes nommés, avec la raison de leur exclusion. */
const INTERNAL_SAH_IDS = new Map<string, string>([
  ['1767', 'Stéphane Madryga — cofondateur, présentateur des webinaires'],
  ['800', 'Guillaume Gosselin — staff Seven At Home'],
  ['5232', 'Killian Gosselin — BREACH, compte de suivi'],
  ['1100', 'Killian Gosselin — BREACH, second compte'],
]);

/**
 * Comptes de service (support, sous-réseaux). Leurs adresses sont en
 * `@sevenathome.<réseau>` : la règle couvre les futurs réseaux sans édition.
 */
const INTERNAL_EMAIL_DOMAIN = '@sevenathome.';

export function isInternalAccount(
  sahId: string | null | undefined,
  email?: string | null,
): boolean {
  if (sahId && INTERNAL_SAH_IDS.has(sahId)) return true;
  return email ? email.toLowerCase().includes(INTERNAL_EMAIL_DOMAIN) : false;
}

/** Pourquoi ce compte est traité comme interne — affiché en clair à l'écran. */
export function internalAccountReason(
  sahId: string | null | undefined,
  email?: string | null,
): string | null {
  if (sahId) {
    const named = INTERNAL_SAH_IDS.get(sahId);
    if (named) return named;
  }
  if (email?.toLowerCase().includes(INTERNAL_EMAIL_DOMAIN))
    return 'Compte de service Seven At Home';
  return null;
}
