import type { ProcessingStatus } from '@/lib/club-deal/constants';

/** Couleur de chaque statut de traitement : classe de badge + couleur pleine (barres, bouton actif). */
export const STATUS_TONE: Record<ProcessingStatus, { badge: string; solid: string }> = {
  nouveau: { badge: 'badge-brand', solid: 'var(--brand)' },
  contacte: { badge: 'badge-warning', solid: 'var(--warning)' },
  dossier_envoye: { badge: 'badge-ai', solid: 'var(--ai)' },
  souscrit: { badge: 'badge-success', solid: 'var(--success)' },
  sans_suite: { badge: 'badge-neutral', solid: 'var(--text-4)' },
};
