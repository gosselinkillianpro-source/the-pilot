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
 * Deux sources, deux rôles :
 *  - « Ont investi » + le « collecté » viennent des souscriptions CRÉDITÉES au
 *    closer par la règle du 4 septembre 2026 (`credit.ts`) : il est le
 *    propriétaire de la personne, la première souscription lui revient s'il a
 *    eu une action dans les 90 jours avant, les suivantes s'il a eu une action
 *    dans les 30 jours avant. C'est la décomposition nominale du chiffre du
 *    classement.
 *  - Les autres sections (KYC, inscription, en cours) décrivent son
 *    portefeuille ATTITRÉ : sa to-do, pas son palmarès.
 *
 * Toute la logique est ici, pure et testée ; la page et les requêtes SQL ne
 * font que l'alimenter.
 */

/** Une souscription créditée au closer (règle du 4 sept. 2026, `credit.ts`). */
export type CreditedSub = {
  investorId: string;
  fullName: string;
  email: string;
  phone: string | null;
  amountEur: number;
  signedAt: Date;
  /** Le lead est-il aussi attitré au closer (propriété collante) ? */
  isOwned: boolean;
  /** Tout l'argent du client, y compris ce qui est crédité à d'autres. */
  totalInvestedEur: number;
  /** Première souscription après le contact, ou réinvestissement. */
  kind?: 'first' | 'follow_up' | null;
  /** Pourquoi elle est créditée (ou pas) — montré tel quel au closer. */
  explanation?: string;
};

/** Un lead attitré au closer — la matière des sections KYC / inscrit / en cours. */
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
  totalInvestedEur: number;
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
   SECTIONS — qui a rapporté quoi, et où en sont les autres
   ============================================================ */

export type InvestedEntry = {
  investorId: string;
  fullName: string;
  email: string;
  phone: string | null;
  /** Le lead est-il attitré au closer ? Sinon, badge « hors portefeuille ». */
  isOwned: boolean;
  /** Crédité au closer dans la période affichée. */
  periodEur: number;
  /** Crédité au closer, toutes dates. */
  creditedEur: number;
  lastInvestAt: Date;
  totalInvestedEur: number;
};

export type PortfolioSections = {
  /** 🎉 Souscriptions créditées au closer dans la période — aligné classement. */
  invested: InvestedEntry[];
  /** Crédités aussi, mais en dehors de la période affichée. */
  investedOutside: InvestedEntry[];
  /** ✅ Attitrés qui PEUVENT investir : KYC validé, rien de crédité encore. */
  kycReady: PortfolioLead[];
  /** 📝 Attitrés, inscription SAH finalisée, KYC pas encore complet. */
  registered: PortfolioLead[];
  /** 📞 Le reste du portefeuille attitré, prochaine action en tête. */
  inProgress: PortfolioLead[];
};

function isInPeriod(d: Date, period: PortfolioPeriod): boolean {
  if (period.from && d.getTime() < period.from.getTime()) return false;
  if (period.to && d.getTime() >= period.to.getTime()) return false;
  return true;
}

/** Tri : prochaine action d'abord (échéance proche en tête), sans échéance ensuite. */
function byNextAction(a: PortfolioLead, b: PortfolioLead): number {
  if (a.nextActionAt && b.nextActionAt) return a.nextActionAt.getTime() - b.nextActionAt.getTime();
  if (a.nextActionAt) return -1;
  if (b.nextActionAt) return 1;
  return (b.lastCallAt?.getTime() ?? 0) - (a.lastCallAt?.getTime() ?? 0);
}

/**
 * Assemble les sections : les souscriptions créditées font le palmarès, les
 * leads attitrés restants font la to-do.
 *
 * La période ne filtre que les souscriptions (seul jalon daté) : « KYC
 * finalisé » et « Inscription finalisée » sont des états courants venus de
 * SAH, sans date de bascule chez nous. Un investisseur crédité n'apparaît
 * JAMAIS en double dans une section d'attente, même hors période.
 */
export function classifyPortfolio(
  leads: PortfolioLead[],
  credited: CreditedSub[],
  period: PortfolioPeriod,
): PortfolioSections {
  // 1. Palmarès : groupage des souscriptions créditées par investisseur.
  const byInvestor = new Map<string, CreditedSub[]>();
  for (const sub of credited) {
    const list = byInvestor.get(sub.investorId) ?? [];
    list.push(sub);
    byInvestor.set(sub.investorId, list);
  }

  const invested: InvestedEntry[] = [];
  const investedOutside: InvestedEntry[] = [];
  for (const [investorId, subs] of byInvestor) {
    const first = subs[0];
    if (!first) continue;
    const periodSubs = subs.filter((s) => isInPeriod(s.signedAt, period));
    const shown = periodSubs.length > 0 ? periodSubs : subs;
    const entry: InvestedEntry = {
      investorId,
      fullName: first.fullName,
      email: first.email,
      phone: first.phone,
      isOwned: first.isOwned,
      periodEur: periodSubs.reduce((t, s) => t + s.amountEur, 0),
      creditedEur: subs.reduce((t, s) => t + s.amountEur, 0),
      lastInvestAt: shown.reduce(
        (max, s) => (s.signedAt > max ? s.signedAt : max),
        shown[0]?.signedAt as Date,
      ),
      totalInvestedEur: first.totalInvestedEur,
    };
    (periodSubs.length > 0 ? invested : investedOutside).push(entry);
  }

  // 2. To-do : les leads attitrés qui n'ont encore rien rapporté.
  const kycReady: PortfolioLead[] = [];
  const registered: PortfolioLead[] = [];
  const inProgress: PortfolioLead[] = [];
  for (const lead of leads) {
    if (byInvestor.has(lead.investorId)) continue;
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
