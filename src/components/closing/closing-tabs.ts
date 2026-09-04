/**
 * Onglets du module closing selon le rôle (refonte du 4 sept. 2026).
 *
 * Un closer n'a que trois pages : Aujourd'hui, Mes clients, Mes résultats.
 * L'admin et la direction gardent en plus les vues d'ensemble (file complète,
 * suivi, base, souscriptions, classement) pour piloter.
 */

export type ClosingTabIcon =
  | 'today'
  | 'clients'
  | 'results'
  | 'queue'
  | 'board'
  | 'investors'
  | 'subscriptions'
  | 'ranking';

export type ClosingTab = { href: string; label: string; icon: ClosingTabIcon };

export const CLOSER_TABS: ClosingTab[] = [
  { href: '/closing/aujourdhui', label: "Aujourd'hui", icon: 'today' },
  { href: '/closing/clients', label: 'Mes clients', icon: 'clients' },
  { href: '/closing/resultats', label: 'Mes résultats', icon: 'results' },
];

export const ADMIN_TABS: ClosingTab[] = [
  ...CLOSER_TABS,
  { href: '/closing/queue', label: 'File complète', icon: 'queue' },
  { href: '/closing/pipeline', label: 'Suivi', icon: 'board' },
  { href: '/closing/investisseurs', label: 'Investisseurs', icon: 'investors' },
  { href: '/closing/souscriptions', label: 'Souscriptions', icon: 'subscriptions' },
  { href: '/closing/classement', label: 'Classement', icon: 'ranking' },
];

export function closingTabsFor(role: string): ClosingTab[] {
  return role === 'closer' || role === 'closer_junior' ? CLOSER_TABS : ADMIN_TABS;
}
