import type { DailyPoint } from './period';

/**
 * Règles de décision et d'alerte de la console Ads — logique PURE (testable).
 *
 * Le revenu SAH est attribué au CANAL (codes, RDV, manuel), pas à la campagne :
 * un ROAS par campagne serait donc une invention. Les décisions par campagne
 * s'appuient sur ce qui est réellement mesuré au niveau campagne : la dépense,
 * les leads pixel (à comparer ENTRE campagnes, pas au coût réel) et la
 * tendance journalière. Le verdict rentabilité se lit au niveau canal
 * (bandeau vital + attribution honnête).
 */

/** Seuils EXPLICITES des règles. Modifier ici = modifier la politique affichée. */
export const DECISION_RULES = {
  /** € de dépense minimum sur la période pour oser un verdict. */
  minSpendForJudgment: 30,
  /** €/jour à partir desquels un jour compte comme « dépense active ». */
  wasteDailySpendFloor: 5,
  /** Jours consécutifs de dépense active sans lead pixel → Couper. */
  wasteDays: 2,
  /** CPL pixel > ce multiple de la médiane du compte → Couper. */
  cutCplFactor: 2,
  /** CPL pixel > ce multiple de la médiane → Réduire. */
  reduceCplFactor: 1.5,
  /** CPL pixel < ce multiple de la médiane (et volume OK) → Scale. */
  scaleCplFactor: 0.7,
  /** Leads pixel minimum sur la période pour scaler (volume suffisant). */
  scaleMinResults: 5,
} as const;

export type DecisionVerdict = 'scale' | 'garder' | 'reduire' | 'couper' | 'observer';

export type CampaignDecision = { verdict: DecisionVerdict; reason: string };

export type DecisionInput = {
  status: 'active' | 'paused';
  spend: number;
  results: number; // leads pixel de la période
  /** Série journalière de la période (peut être vide si l'appel a échoué). */
  series: DailyPoint[];
};

/** CPL pixel médian des campagnes jugeables — la référence des règles. */
export function medianCpl(campaigns: { spend: number; results: number }[]): number | null {
  const cpls = campaigns
    .filter((c) => c.results > 0 && c.spend >= DECISION_RULES.minSpendForJudgment)
    .map((c) => c.spend / c.results)
    .sort((a, b) => a - b);
  if (cpls.length === 0) return null;
  const mid = Math.floor(cpls.length / 2);
  const high = cpls[mid] ?? 0;
  if (cpls.length % 2 === 1) return high;
  const low = cpls[mid - 1] ?? high;
  return (low + high) / 2;
}

/** Les N derniers jours de la série dépensent sans produire un seul lead ? */
function isWastingRecently(series: DailyPoint[], rules: typeof DECISION_RULES): boolean {
  if (series.length < rules.wasteDays) return false;
  const tail = series.slice(-rules.wasteDays);
  return (
    tail.every((d) => d.spend >= rules.wasteDailySpendFloor) && tail.every((d) => d.results === 0)
  );
}

const F = (x: number) => x.toLocaleString('fr-FR', { maximumFractionDigits: 0 });

/** Applique les règles dans l'ordre — la première qui matche donne le verdict. */
export function decideCampaign(
  c: DecisionInput,
  median: number | null,
  rules: typeof DECISION_RULES = DECISION_RULES,
): CampaignDecision {
  if (c.status === 'paused') {
    return { verdict: 'observer', reason: 'Campagne en pause — rien à décider.' };
  }
  if (c.spend < rules.minSpendForJudgment) {
    return {
      verdict: 'observer',
      reason: `Moins de ${rules.minSpendForJudgment} € dépensés — trop tôt pour juger.`,
    };
  }
  if (isWastingRecently(c.series, rules)) {
    return {
      verdict: 'couper',
      reason: `${rules.wasteDays} jours de dépense (≥ ${rules.wasteDailySpendFloor} €/j) sans un seul lead.`,
    };
  }
  if (c.results === 0) {
    return {
      verdict: 'couper',
      reason: `${F(c.spend)} € dépensés, 0 lead pixel sur la période.`,
    };
  }

  const cpl = c.spend / c.results;
  if (median !== null && median > 0) {
    if (cpl > median * rules.cutCplFactor) {
      return {
        verdict: 'couper',
        reason: `CPL ${F(cpl)} € > ${rules.cutCplFactor}× la médiane du compte (${F(median)} €).`,
      };
    }
    if (cpl > median * rules.reduceCplFactor) {
      return {
        verdict: 'reduire',
        reason: `CPL ${F(cpl)} € > ${rules.reduceCplFactor}× la médiane (${F(median)} €).`,
      };
    }
    if (cpl < median * rules.scaleCplFactor && c.results >= rules.scaleMinResults) {
      return {
        verdict: 'scale',
        reason: `CPL ${F(cpl)} € < ${Math.round(rules.scaleCplFactor * 100)} % de la médiane (${F(median)} €), volume OK (${c.results} leads).`,
      };
    }
  }
  return { verdict: 'garder', reason: `CPL ${F(cpl)} € dans la norme du compte.` };
}

/* ----------------------------- Alertes de rupture ----------------------------- */

export type ConsoleAlert = {
  level: 'danger' | 'warning';
  title: string;
  detail: string;
  /** Présent → l'alerte pointe vers une campagne précise (ancre du tableau). */
  campaignId?: string;
};

/** Seuils EXPLICITES des alertes de rupture de tendance. */
export const ALERT_RULES = {
  /** CPL compte : +X % sur les 3 derniers jours vs les 3 précédents. */
  cplJumpPct: 30,
  cplWindowDays: 3,
  /** Taux de show : chute relative de X % vs période précédente. */
  showRateDropPct: 20,
  /** RDV minimum (sur chaque période) pour que le taux de show ait un sens. */
  showRateMinRdv: 5,
} as const;

function cplOf(points: DailyPoint[]): number | null {
  const spend = points.reduce((a, p) => a + p.spend, 0);
  const results = points.reduce((a, p) => a + p.results, 0);
  return results > 0 ? spend / results : null;
}

export function buildConsoleAlerts(input: {
  /** Série journalière compte (période courante, triée par date). */
  accountDaily: DailyPoint[];
  campaigns: { id: string; name: string; status: 'active' | 'paused' }[];
  seriesByCampaign: Map<string, DailyPoint[]>;
  rdv: { cur: { pris: number; honores: number }; prev: { pris: number; honores: number } };
}): ConsoleAlert[] {
  const alerts: ConsoleAlert[] = [];
  const R = ALERT_RULES;

  // 1. CPL compte en rupture : 3 derniers jours vs 3 précédents.
  const w = R.cplWindowDays;
  if (input.accountDaily.length >= 2 * w) {
    const recent = cplOf(input.accountDaily.slice(-w));
    const before = cplOf(input.accountDaily.slice(-2 * w, -w));
    if (recent !== null && before !== null && before > 0) {
      const jump = ((recent - before) / before) * 100;
      if (jump >= R.cplJumpPct) {
        alerts.push({
          level: 'danger',
          title: `CPL en rupture : +${Math.round(jump)} % sur ${w} jours`,
          detail: `${F(before)} € → ${F(recent)} € par lead pixel (${w} derniers jours vs ${w} précédents).`,
        });
      }
    }
  }

  // 2. Campagne active qui dépense sans lead depuis 48 h.
  for (const c of input.campaigns) {
    if (c.status !== 'active') continue;
    const series = input.seriesByCampaign.get(c.id) ?? [];
    if (isWastingRecently(series, DECISION_RULES)) {
      const wasted = series.slice(-DECISION_RULES.wasteDays).reduce((a, p) => a + p.spend, 0);
      alerts.push({
        level: 'danger',
        title: `${c.name} : dépense sans lead depuis 48 h`,
        detail: `${F(wasted)} € sur les ${DECISION_RULES.wasteDays} derniers jours, 0 lead pixel.`,
        campaignId: c.id,
      });
    }
  }

  // 3. Taux de show en chute vs période précédente.
  const { cur, prev } = input.rdv;
  if (cur.pris >= R.showRateMinRdv && prev.pris >= R.showRateMinRdv && prev.honores > 0) {
    const curRate = cur.honores / cur.pris;
    const prevRate = prev.honores / prev.pris;
    if (prevRate > 0) {
      const drop = ((prevRate - curRate) / prevRate) * 100;
      if (drop >= R.showRateDropPct) {
        alerts.push({
          level: 'warning',
          title: `Taux de show en chute : −${Math.round(drop)} %`,
          detail: `${Math.round(curRate * 100)} % de RDV honorés (${cur.honores}/${cur.pris}) contre ${Math.round(prevRate * 100)} % sur la période précédente.`,
        });
      }
    }
  }

  return alerts.sort((a, b) => (a.level === 'danger' ? -1 : 1) - (b.level === 'danger' ? -1 : 1));
}
