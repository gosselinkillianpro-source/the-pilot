/**
 * GARDE-FOUS DE COHÉRENCE (Phase 1 — source de vérité).
 *
 * Contrôles automatiques exécutables à chaque sync / chargement. Toute incohérence
 * détectée lève une alerte visible et marque la (les) métrique(s) concernée(s)
 * « à vérifier » plutôt que de l'afficher comme fiable.
 *
 * Fonctions PURES (aucune dépendance DB) → entièrement testables.
 */

export type GuardrailLevel = 'error' | 'warn';

export type GuardrailIssue = {
  id: string;
  level: GuardrailLevel;
  message: string;
  /** Métriques (ids catalogue) rendues « à vérifier » par cette incohérence. */
  metricIds: string[];
};

export type GuardrailReport = {
  ok: boolean;
  issues: GuardrailIssue[];
  /** Ensemble des ids de métriques à marquer « à vérifier ». */
  suspect: Set<string>;
};

/** Tolérance d'arrondi sur les montants € (les sommes filtrées peuvent différer de 1€). */
const EUR_TOLERANCE = 1;

/**
 * Ratio SÛR : renvoie `null` si le dénominateur est nul/négatif ou non fini.
 * Garantit qu'aucune moyenne (ticket moyen, taux…) n'est calculée sur un dénominateur nul.
 */
export function safeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return numerator / denominator;
}

/** Somme d'une ventilation (ex : collecte par projet) ≈ total affiché. */
export function checkSumEqualsTotal(
  parts: number[],
  total: number,
  opts: { id: string; label: string; metricIds: string[]; tolerance?: number },
): GuardrailIssue | null {
  const tol = opts.tolerance ?? EUR_TOLERANCE;
  const sum = parts.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  if (Math.abs(sum - total) <= tol) return null;
  return {
    id: opts.id,
    level: 'warn',
    message: `${opts.label} : la somme par éléments (${Math.round(sum)}) ≠ total affiché (${Math.round(total)}). Écart ${Math.round(sum - total)}.`,
    metricIds: opts.metricIds,
  };
}

/** Étapes de funnel monotones décroissantes (chaque étape ≤ la précédente). */
export function checkMonotonic(
  steps: { label: string; value: number }[],
  opts: { id: string; metricIds: string[] },
): GuardrailIssue | null {
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const cur = steps[i];
    if (!prev || !cur) continue;
    if (cur.value > prev.value) {
      return {
        id: opts.id,
        level: 'error',
        message: `Funnel incohérent : « ${cur.label} » (${cur.value}) > « ${prev.label} » (${prev.value}). Une étape ne peut pas dépasser la précédente.`,
        metricIds: opts.metricIds,
      };
    }
  }
  return null;
}

/** Une borne ne doit pas dépasser un total de référence (ex : ont investi ≤ base totale). */
export function checkWithin(
  value: number,
  max: number,
  opts: { id: string; label: string; metricIds: string[] },
): GuardrailIssue | null {
  if (value <= max) return null;
  return {
    id: opts.id,
    level: 'error',
    message: `${opts.label} : ${value} > maximum attendu ${max}. Incohérence de comptage.`,
    metricIds: opts.metricIds,
  };
}

/** Aucune valeur affichée ne doit être négative (montants, comptages). */
export function checkNonNegative(
  entries: { value: number; label: string; metricId: string }[],
): GuardrailIssue[] {
  return entries
    .filter((e) => Number.isFinite(e.value) && e.value < 0)
    .map((e) => ({
      id: `negative:${e.metricId}`,
      level: 'error' as const,
      message: `${e.label} : valeur négative (${e.value}) — impossible.`,
      metricIds: [e.metricId],
    }));
}

export type ConsistencySnapshot = {
  collecteTotale: number;
  /** Collecte ventilée par projet — sa somme doit ≈ collecteTotale. */
  collecteParProjet: number[];
  investisseursTotal: number;
  investisseursAyantInvesti: number;
  /** Étapes du funnel, ordre décroissant attendu (inscrits ≥ … ≥ investisseurs). */
  funnel: { label: string; value: number }[];
  /** Tickets/taux à vérifier (dénominateur non nul). */
  ratios?: { numerator: number; denominator: number; label: string; metricId: string }[];
};

/** Exécute tous les garde-fous sur un instantané de données et agrège le rapport. */
export function runGuardrails(s: ConsistencySnapshot): GuardrailReport {
  const issues: GuardrailIssue[] = [];

  const sumIssue = checkSumEqualsTotal(s.collecteParProjet, s.collecteTotale, {
    id: 'collecte-par-projet',
    label: 'Collecte par projet vs total',
    metricIds: ['collecte_totale', 'projet_collecte'],
  });
  if (sumIssue) issues.push(sumIssue);

  const withinIssue = checkWithin(s.investisseursAyantInvesti, s.investisseursTotal, {
    id: 'investisseurs-coherence',
    label: 'Investisseurs ayant investi',
    metricIds: ['investisseurs_ayant_investi', 'investisseurs_total'],
  });
  if (withinIssue) issues.push(withinIssue);

  const funnelIssue = checkMonotonic(s.funnel, {
    id: 'funnel-monotone',
    metricIds: ['investisseurs_total', 'taux_onboarding_kyc', 'investisseurs_ayant_investi'],
  });
  if (funnelIssue) issues.push(funnelIssue);

  issues.push(
    ...checkNonNegative([
      { value: s.collecteTotale, label: 'Collecte totale', metricId: 'collecte_totale' },
      { value: s.investisseursTotal, label: 'Investisseurs', metricId: 'investisseurs_total' },
    ]),
  );

  for (const r of s.ratios ?? []) {
    if (safeRatio(r.numerator, r.denominator) === null) {
      issues.push({
        id: `ratio-denom:${r.metricId}`,
        level: 'warn',
        message: `${r.label} : dénominateur nul → non affichable (pas de moyenne sur 0).`,
        metricIds: [r.metricId],
      });
    }
  }

  const suspect = new Set<string>();
  for (const i of issues) for (const m of i.metricIds) suspect.add(m);

  return { ok: issues.every((i) => i.level !== 'error'), issues, suspect };
}
