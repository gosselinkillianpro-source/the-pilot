/**
 * Helpers PURS de fraîcheur des sources (aucune dépendance serveur) → testables.
 */

export type ConnectorKey =
  | 'sah_db'
  | 'brevo'
  | 'meta_ads'
  | 'google_ads'
  | 'ga4'
  | 'calendly'
  | 'whatsapp';

export type SourceStatus =
  | 'ok' // branchée + à jour
  | 'stale' // branchée mais données vieilles (au-delà du seuil)
  | 'down' // branchée mais l'appel a échoué
  | 'not_configured' // intégration prévue mais clés/API absentes
  | 'not_connected'; // annoncée mais AUCUN code d'intégration (GA4, Calendly, WhatsApp)

export type SourceHealth = {
  key: ConnectorKey;
  label: string;
  status: SourceStatus;
  /** Texte de fraîcheur (« il y a 12 min », « temps réel (API) », « —, non branché »). */
  freshness: string;
  /** Horodatage ISO de la donnée si connu (pour la base SAH), sinon null. */
  freshnessAt: string | null;
  /** Détail : nb de lignes, message d'erreur, ou note de transparence. */
  detail: string;
};

/** Au-delà de ce délai, les données SAH sont considérées « périmées ». */
export const STALE_MS = 2 * 60 * 60 * 1000; // 2 h

/** « il y a X min/h/j » à partir d'une date et d'un instant de référence. */
export function formatAgo(d: Date | null, now: number): string {
  if (!d) return '—';
  const mins = Math.floor((now - d.getTime()) / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

/**
 * Classe la fraîcheur d'une source basée sur la base SAH (max(updated_at)).
 * - null → 'down' (aucune donnée / requête échouée).
 * - plus vieux que STALE_MS → 'stale'.
 * - sinon → 'ok'.
 */
export function classifyFreshness(at: Date | null, now: number): SourceStatus {
  if (!at) return 'down';
  return now - at.getTime() > STALE_MS ? 'stale' : 'ok';
}
