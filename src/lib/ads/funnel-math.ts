/**
 * Funnel de pilotage pub — logique PURE (pas de DB, testable).
 *
 * Impressions → Clics → Leads → RDV pris → RDV honorés → Closes → Revenu.
 * Entre chaque étape : taux de conversion (+ le même taux sur la période
 * précédente) et coût unitaire quand il a un sens (CPL, coût/RDV, CAC).
 *
 * Honnêteté avant tout : une étape non trackée est affichée « non tracké »,
 * jamais zéro. Le funnel peut être non monotone (on peut prendre RDV sans être
 * inscrit SAH) : les taux > 100 % sont affichés tels quels.
 */

export type FunnelInput = {
  impressions: number | null; // null = non tracké / source indisponible
  clicks: number | null;
  leads: number | null; // inscrits SAH attribués ads
  rdvPris: number | null;
  rdvHonores: number | null;
  closes: number | null; // investisseurs (souscription signée)
  revenue: number | null; // € signés attribués
};

export type FunnelStepKey = keyof FunnelInput;

export type FunnelStep = {
  key: FunnelStepKey;
  label: string;
  value: number | null;
  isEuro: boolean;
  /** Taux de conversion depuis l'étape trackée précédente (en %). */
  conv: number | null;
  /** Même taux sur la période précédente. */
  prevConv: number | null;
  /** Variation relative du taux vs période précédente (en %). */
  convDeltaPct: number | null;
  /** Coût unitaire = dépense ÷ valeur (CPL, coût/RDV, CAC). */
  unitCost: number | null;
  unitCostLabel: string | null;
};

const STEP_DEFS: {
  key: FunnelStepKey;
  label: string;
  isEuro: boolean;
  costLabel: string | null;
}[] = [
  { key: 'impressions', label: 'Impressions', isEuro: false, costLabel: null },
  { key: 'clicks', label: 'Clics', isEuro: false, costLabel: null },
  { key: 'leads', label: 'Leads', isEuro: false, costLabel: 'CPL' },
  { key: 'rdvPris', label: 'RDV pris', isEuro: false, costLabel: 'coût / RDV' },
  { key: 'rdvHonores', label: 'RDV honorés', isEuro: false, costLabel: null },
  { key: 'closes', label: 'Closes', isEuro: false, costLabel: 'CAC' },
  { key: 'revenue', label: 'Revenu', isEuro: true, costLabel: null },
];

/** Seuil de dégradation en dessous duquel on ne met rien en évidence (bruit). */
const DEGRADATION_NOISE_PCT = -5;

function rate(value: number | null, base: number | null): number | null {
  if (value === null || base === null || base <= 0) return null;
  return (value / base) * 100;
}

export type Funnel = {
  steps: FunnelStep[];
  /** Étape dont le taux de conversion s'est le plus dégradé vs période précédente. */
  worstKey: FunnelStepKey | null;
};

export function buildFunnel(cur: FunnelInput, prev: FunnelInput, spend: number): Funnel {
  const steps: FunnelStep[] = [];
  let prevTrackedCur: number | null = null;
  let prevTrackedPrev: number | null = null;

  for (const def of STEP_DEFS) {
    const value = cur[def.key];
    const prevValue = prev[def.key];
    // Pas de « taux » pour une étape en euros : € ÷ closes n'est pas un pourcentage.
    const conv = def.isEuro ? null : rate(value, prevTrackedCur);
    const prevConv = def.isEuro ? null : rate(prevValue, prevTrackedPrev);
    const convDeltaPct =
      conv !== null && prevConv !== null && prevConv > 0
        ? Math.round(((conv - prevConv) / prevConv) * 100)
        : null;
    const unitCost =
      def.costLabel && value !== null && value > 0 && spend > 0 ? spend / value : null;

    steps.push({
      key: def.key,
      label: def.label,
      value,
      isEuro: def.isEuro,
      conv,
      prevConv,
      convDeltaPct,
      unitCost,
      unitCostLabel: def.costLabel,
    });

    // L'étape suivante se compare à la dernière étape TRACKÉE (les trous ne
    // cassent pas la chaîne, ils sont juste affichés « non tracké »).
    if (value !== null) prevTrackedCur = value;
    if (prevValue !== null) prevTrackedPrev = prevValue;
  }

  let worstKey: FunnelStepKey | null = null;
  let worstDelta = DEGRADATION_NOISE_PCT;
  for (const s of steps) {
    if (s.convDeltaPct !== null && s.convDeltaPct < worstDelta) {
      worstDelta = s.convDeltaPct;
      worstKey = s.key;
    }
  }

  return { steps, worstKey };
}
