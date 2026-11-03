/**
 * Club deal : compteurs de l'écran, calculés à partir des lignes (fonction pure).
 * Un « investisseur » = une adresse e-mail distincte. Pour la tranche et le
 * potentiel, on retient la demande la PLUS RÉCENTE de chaque investisseur
 * (une personne qui renvoie le formulaire ne compte pas deux fois).
 */
import {
  type ClubDealRow,
  DOSSIER_CODES,
  type DossierCode,
  isKeyOf,
  MONTANT_BOUNDS,
  MONTANT_CODES,
  type MontantCode,
  PROCESSING,
  PROCESSING_CODES,
  type ProcessingStatus,
} from './constants';

export type ProjectStats = {
  code: DossierCode;
  intentions: number;
  investors: number;
  toProcess: number;
  subscribed: number;
  byStatus: Record<ProcessingStatus, number>;
};

export type ClubDealStats = {
  total: number;
  toProcess: number;
  investors: number;
  subscribed: number;
  duplicates: number;
  withCallConsent: number;
  byStatus: Record<ProcessingStatus, number>;
  projects: ProjectStats[];
  /** Investisseurs distincts par tranche (demande la plus récente). */
  tranches: { code: MontantCode; investors: number }[];
  /** Fourchette déclarée (hors « je préfère en parler »). `max` null = au moins une tranche > 100 k€. */
  potential: { min: number; max: number | null; undisclosed: number };
};

function emptyStatusCounts(): Record<ProcessingStatus, number> {
  return Object.fromEntries(PROCESSING_CODES.map((c) => [c, 0])) as Record<
    ProcessingStatus,
    number
  >;
}

function statusOf(r: ClubDealRow): ProcessingStatus {
  return isKeyOf(PROCESSING, r.processing_status) ? r.processing_status : 'nouveau';
}

/** Demande la plus récente de chaque e-mail. */
export function latestByEmail(rows: readonly ClubDealRow[]): ClubDealRow[] {
  const latest = new Map<string, ClubDealRow>();
  for (const r of rows) {
    const prev = latest.get(r.email);
    if (!prev || new Date(r.created_at) > new Date(prev.created_at)) latest.set(r.email, r);
  }
  return [...latest.values()];
}

function projectStats(rows: readonly ClubDealRow[], code: DossierCode): ProjectStats {
  const mine = rows.filter((r) => r.dossiers.includes(code));
  const byStatus = emptyStatusCounts();
  for (const r of mine) byStatus[statusOf(r)] += 1;
  const subscribedEmails = new Set(
    mine.filter((r) => statusOf(r) === 'souscrit').map((r) => r.email),
  );
  return {
    code,
    intentions: mine.length,
    investors: new Set(mine.map((r) => r.email)).size,
    toProcess: byStatus.nouveau,
    subscribed: subscribedEmails.size,
    byStatus,
  };
}

export function computeStats(rows: readonly ClubDealRow[]): ClubDealStats {
  const byStatus = emptyStatusCounts();
  for (const r of rows) byStatus[statusOf(r)] += 1;

  const latest = latestByEmail(rows);
  const trancheCounts = new Map<string, number>();
  let min = 0;
  let max: number | null = 0;
  let undisclosed = 0;
  for (const r of latest) {
    trancheCounts.set(r.montant, (trancheCounts.get(r.montant) ?? 0) + 1);
    const bounds = isKeyOf(MONTANT_BOUNDS, r.montant) ? MONTANT_BOUNDS[r.montant] : null;
    if (!bounds) {
      undisclosed += 1;
      continue;
    }
    min += bounds.min;
    max = max === null || bounds.max === null ? null : max + bounds.max;
  }

  return {
    total: rows.length,
    toProcess: byStatus.nouveau,
    investors: latest.length,
    subscribed: new Set(rows.filter((r) => statusOf(r) === 'souscrit').map((r) => r.email)).size,
    duplicates: rows.filter((r) => r.duplicate_of).length,
    withCallConsent: latest.filter((r) => r.telephone && r.consent_tel).length,
    byStatus,
    projects: DOSSIER_CODES.map((code) => projectStats(rows, code)),
    tranches: MONTANT_CODES.map((code) => ({ code, investors: trancheCounts.get(code) ?? 0 })),
    potential: { min, max, undisclosed },
  };
}
