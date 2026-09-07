/**
 * Répartition des nouveaux inscrits pubs entre closers — la règle, sans base.
 *
 * Décision Killian (7 sept. 2026) : fini le pool « au plus rapide » pour les
 * inscrits venus des pubs. Chaque nouvel inscrit pub est attribué à un closer
 * de la rotation, à tour de rôle, dès son arrivée. Si le closer n'engage
 * AUCUNE action (appel, SMS, mail, note, action planifiée) dans les 72 heures,
 * la personne est reprise et donnée au suivant.
 *
 *   - Rotation : les closers actifs qui « reçoivent les nouveaux leads »
 *     (réglage admin, page Équipe). Le prochain servi est le moins récemment
 *     servi ; un closer jamais servi passe en premier.
 *   - Reprise : jamais au closer qui vient de la laisser passer. S'il est le
 *     seul de la rotation, la personne lui reste (on ne la perd pas).
 *   - Le reste du pool (parrainage, base historique) ne change pas.
 *
 * Module pur, testé. Les requêtes (`queries/lead-distribution.ts`) l'alimentent.
 */

/** Délai sans action au bout duquel un lead réparti change de closer. */
export const REDISTRIBUTION_AFTER_HOURS = 72;

/**
 * Seuls les inscrits de moins de 7 jours entrent dans la répartition : au-delà,
 * l'urgence est passée, la personne reste dans le pool commun. Aligné sur la
 * fenêtre « nouvel inscrit » du scoring.
 */
export const DISTRIBUTION_WINDOW_DAYS = 7;

/** Attributions faites par la répartition (et non par un appel, un admin, un code CGP). */
export const DISTRIBUTED_SOURCES = ['distribution', 'redistribution'] as const;

export function isDistributedSource(source: string | null | undefined): boolean {
  return source === 'distribution' || source === 'redistribution';
}

export type RotationCloser = {
  id: string;
  name?: string | null;
  lastLeadDistributedAt: Date | null;
};

/**
 * Le prochain closer servi : le moins récemment servi, jamais servi d'abord.
 * Égalité → ordre alphabétique du nom puis de l'id, pour rester déterministe.
 * `exclude` écarte par exemple le closer qui vient de laisser passer le lead.
 */
export function pickNextCloser<T extends RotationCloser>(
  closers: readonly T[],
  exclude: readonly string[] = [],
): T | null {
  const excluded = new Set(exclude);
  const eligible = closers.filter((c) => !excluded.has(c.id));
  if (eligible.length === 0) return null;
  const sorted = [...eligible].sort((a, b) => {
    const at = a.lastLeadDistributedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const bt = b.lastLeadDistributedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (at !== bt) return at - bt;
    const an = (a.name ?? '').localeCompare(b.name ?? '');
    if (an !== 0) return an;
    return a.id.localeCompare(b.id);
  });
  return sorted[0] ?? null;
}

const HOUR_MS = 3_600_000;

/** Instant où la personne sera reprise si rien n'a été fait. */
export function redistributionDeadline(assignedAt: Date): Date {
  return new Date(assignedAt.getTime() + REDISTRIBUTION_AFTER_HOURS * HOUR_MS);
}

/** Heures restantes avant reprise (négatif = déjà dépassé). Arrondi au plus proche. */
export function hoursUntilRedistribution(assignedAt: Date, now: Date): number {
  return Math.round((redistributionDeadline(assignedAt).getTime() - now.getTime()) / HOUR_MS);
}

export type StaleInput = {
  assignedAt: Date;
  /** Dernière action du closer PROPRIÉTAIRE sur cette personne, null si aucune. */
  lastOwnerActionAt: Date | null;
};

/** Le délai est écoulé et le propriétaire n'a rien fait depuis l'attribution. */
export function isStaleAssignment(input: StaleInput, now: Date): boolean {
  if (now.getTime() < redistributionDeadline(input.assignedAt).getTime()) return false;
  if (!input.lastOwnerActionAt) return true;
  return input.lastOwnerActionAt.getTime() < input.assignedAt.getTime();
}

export type FreshLeadInput = {
  assignmentSource: string | null;
  assignedAt: Date | null;
  /** Dernière activité connue sur la fiche (n'importe qui), null si aucune. */
  lastActivityAt: Date | null;
  hasNextTask: boolean;
};

/**
 * Un « nouveau lead à toi » : réparti, et rien n'a encore été fait depuis
 * l'attribution. C'est ce qui s'affiche en haut d'« Aujourd'hui » avec le
 * compte à rebours, et ce qui sort de « à planifier ».
 */
export function isFreshDistributedLead(row: FreshLeadInput): boolean {
  if (!isDistributedSource(row.assignmentSource) || !row.assignedAt) return false;
  if (row.hasNextTask) return false;
  if (!row.lastActivityAt) return true;
  return row.lastActivityAt.getTime() < row.assignedAt.getTime();
}

/** « encore 52 h », « moins d'une heure », « en retard de 3 h ». */
export function deadlineLabel(assignedAt: Date, now: Date): string {
  const h = hoursUntilRedistribution(assignedAt, now);
  if (h <= 0) return h === 0 ? "moins d'une heure" : `en retard de ${-h} h`;
  return `encore ${h} h`;
}
