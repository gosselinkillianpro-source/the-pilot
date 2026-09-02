import { currentPeriod, parisDateOf, parisMidnightUTC } from '@/lib/closing/gamification/periods';
import type { ClosingStage } from '@/lib/closing/pipeline';

/**
 * « Mon portefeuille » — la vue RÉSULTATS du closer.
 *
 * Le kanban « Mes leads » montre le processus (où en est chaque carte) ; le
 * portefeuille montre ce que ça a donné : qui a investi et pour combien, qui
 * peut investir (KYC validé), qui a finalisé son inscription, qui reste à
 * travailler. Demande du terrain : depuis le classement agrégé, les closers ne
 * voyaient plus NOMINATIVEMENT qui était passé à l'action.
 *
 * Toute la logique est ici, pure et testée ; la page et la requête SQL ne font
 * que l'alimenter.
 */

export type PortfolioSub = {
  amountEur: number;
  signedAt: Date;
};

export type PortfolioLead = {
  investorId: string;
  fullName: string;
  email: string;
  phone: string | null;
  stage: ClosingStage;
  enteredAt: Date | null;
  registrationComplete: boolean;
  onboardingComplete: boolean;
  walletBalanceCents: number | null;
  nextActionAt: Date | null;
  lastCallAt: Date | null;
  /** Tout l'argent du client, y compris AVANT le premier appel du closer. */
  totalInvestedEur: number;
  /** Souscriptions signées après l'entrée dans le portefeuille — attribuables. */
  subs: PortfolioSub[];
};

/* ============================================================
   PÉRIODES — semaine / mois / tout / dates libres
   ============================================================ */

export type PortfolioPeriodKey = 'semaine' | 'mois' | 'tout' | 'custom';

export type PortfolioPeriod = {
  key: PortfolioPeriodKey;
  /** Borne incluse — null : pas de borne (« tout »). */
  from: Date | null;
  /** Borne EXCLUE — null : pas de borne. */
  to: Date | null;
  label: string;
};

type Day = { year: number; month: number; day: number };

/** `YYYY-MM-DD` strict, avec rejet des dates impossibles (31 février…). */
function parseDay(value: string | undefined): Day | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const check = new Date(Date.UTC(y, m - 1, d));
  const isReal =
    check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
  return isReal ? { year: y, month: m, day: d } : null;
}

function shiftDay(day: Day, days: number): Day {
  const d = new Date(Date.UTC(day.year, day.month - 1, day.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function fmtDay(day: Day): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(day.day)}/${pad(day.month)}/${day.year}`;
}

/**
 * Résout la période affichée à partir des paramètres d'URL.
 *
 * Des dates libres valides (`du` ≤ `au`, bornes incluses toutes les deux)
 * priment sur l'onglet ; tout paramètre invalide retombe sur l'onglet, puis
 * sur « tout » — une URL bricolée ne doit jamais casser la page.
 */
export function resolvePortfolioPeriod(
  params: { periode?: string; du?: string; au?: string },
  now: Date = new Date(),
): PortfolioPeriod {
  const du = parseDay(params.du);
  const au = parseDay(params.au);
  if (du && au) {
    const from = parisMidnightUTC(du.year, du.month, du.day);
    const auNext = shiftDay(au, 1);
    const to = parisMidnightUTC(auNext.year, auNext.month, auNext.day);
    if (from.getTime() < to.getTime()) {
      return { key: 'custom', from, to, label: `du ${fmtDay(du)} au ${fmtDay(au)}` };
    }
  }

  if (params.periode === 'semaine') {
    const p = currentPeriod('week', now);
    return { key: 'semaine', from: p.from, to: p.to, label: 'Cette semaine' };
  }

  if (params.periode === 'mois') {
    const today = parisDateOf(now);
    const next =
      today.month === 12
        ? { year: today.year + 1, month: 1 }
        : { year: today.year, month: today.month + 1 };
    return {
      key: 'mois',
      from: parisMidnightUTC(today.year, today.month, 1),
      to: parisMidnightUTC(next.year, next.month, 1),
      label: 'Ce mois-ci',
    };
  }

  return { key: 'tout', from: null, to: null, label: 'Depuis le début' };
}

/* ============================================================
   SECTIONS — qui est passé à l'action, et où en sont les autres
   ============================================================ */

export type InvestedEntry = {
  lead: PortfolioLead;
  /** Souscriptions post-entrée dans la période affichée. */
  periodEur: number;
  /** Toutes les souscriptions post-entrée — ce que le closer a fait rentrer. */
  attributableEur: number;
  lastInvestAt: Date;
};

export type PortfolioSections = {
  /** 🎉 Ont investi (souscription post-entrée dans la période). */
  invested: InvestedEntry[];
  /** Ont investi aussi, mais en dehors de la période affichée. */
  investedOutside: InvestedEntry[];
  /** ✅ Peuvent investir : KYC validé côté SAH, pas encore souscrit. */
  kycReady: PortfolioLead[];
  /** 📝 Inscription SAH finalisée, KYC pas encore complet. */
  registered: PortfolioLead[];
  /** 📞 Le reste du portefeuille, avec la prochaine action en tête. */
  inProgress: PortfolioLead[];
};

function isInPeriod(d: Date, period: PortfolioPeriod): boolean {
  if (period.from && d.getTime() < period.from.getTime()) return false;
  if (period.to && d.getTime() >= period.to.getTime()) return false;
  return true;
}

function sum(subs: PortfolioSub[]): number {
  return subs.reduce((total, s) => total + s.amountEur, 0);
}

function lastSignedAt(subs: PortfolioSub[]): Date {
  return subs.reduce((max, s) => (s.signedAt > max ? s.signedAt : max), subs[0]?.signedAt as Date);
}

/** Tri : prochaine action d'abord (échéance proche en tête), sans échéance ensuite. */
function byNextAction(a: PortfolioLead, b: PortfolioLead): number {
  if (a.nextActionAt && b.nextActionAt) return a.nextActionAt.getTime() - b.nextActionAt.getTime();
  if (a.nextActionAt) return -1;
  if (b.nextActionAt) return 1;
  return (b.lastCallAt?.getTime() ?? 0) - (a.lastCallAt?.getTime() ?? 0);
}

/**
 * Range chaque lead dans sa section, selon le jalon le PLUS AVANCÉ atteint.
 *
 * La période ne s'applique qu'aux souscriptions (seul jalon dont on connaît la
 * date exacte) : « KYC finalisé » et « Inscription finalisée » sont des états
 * courants venus de SAH, sans date de bascule chez nous.
 */
export function classifyPortfolio(
  leads: PortfolioLead[],
  period: PortfolioPeriod,
): PortfolioSections {
  const invested: InvestedEntry[] = [];
  const investedOutside: InvestedEntry[] = [];
  const kycReady: PortfolioLead[] = [];
  const registered: PortfolioLead[] = [];
  const inProgress: PortfolioLead[] = [];

  for (const lead of leads) {
    if (lead.subs.length > 0) {
      const periodSubs = lead.subs.filter((s) => isInPeriod(s.signedAt, period));
      const entry: InvestedEntry = {
        lead,
        periodEur: sum(periodSubs),
        attributableEur: sum(lead.subs),
        lastInvestAt: lastSignedAt(periodSubs.length > 0 ? periodSubs : lead.subs),
      };
      (periodSubs.length > 0 ? invested : investedOutside).push(entry);
      continue;
    }
    if (lead.onboardingComplete) {
      kycReady.push(lead);
      continue;
    }
    if (lead.registrationComplete) {
      registered.push(lead);
      continue;
    }
    inProgress.push(lead);
  }

  invested.sort((a, b) => b.lastInvestAt.getTime() - a.lastInvestAt.getTime());
  investedOutside.sort((a, b) => b.lastInvestAt.getTime() - a.lastInvestAt.getTime());
  // Les plus gros wallets d'abord : c'est de l'argent qui attend d'être placé.
  kycReady.sort((a, b) => (b.walletBalanceCents ?? 0) - (a.walletBalanceCents ?? 0));
  registered.sort((a, b) => (b.lastCallAt?.getTime() ?? 0) - (a.lastCallAt?.getTime() ?? 0));
  inProgress.sort(byNextAction);

  return { invested, investedOutside, kycReady, registered, inProgress };
}
