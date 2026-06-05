/**
 * Moteur de scoring d'appel — « qui appeler, dans quel ordre, maintenant ».
 * Implémente docs/the-pilot-priorisation-performance.md (Partie I).
 *
 * 100 % transparent et explicable (exigence RGPD en contexte financier) : chaque
 * score expose le détail de ses facteurs. C'est une AIDE à la décision, jamais une
 * décision automatique — le closer garde la main.
 *
 * Signaux utilisés aujourd'hui : statut, ancienneté, échéance de remboursement
 * (souscription + durée projet), montant investi. Les points d'engagement e-mail
 * (clics/ouvertures/réponse) se brancheront ensuite sans changer cette logique.
 */

export type InvestorStatus = 'A' | 'B' | 'C' | 'D' | 'E';

export type ScoringInput = {
  registrationComplete: boolean;
  onboardingComplete: boolean;
  sahCreatedAt: Date | null;
  totalInvested: number;
  activeSubscriptions: number;
  /** Jours avant le remboursement le plus proche (statut E), null si aucun à venir. */
  nearestRepaymentDays: number | null;
  /** Jours depuis le TOUT PREMIER investissement (statut E), null si jamais investi. */
  firstInvestmentDays: number | null;
  /** Nb de projets en cours (pour signaler au closer). */
  activeProjectsCount: number;
  /** Engagement e-mail (pas encore branché → 0/false par défaut). */
  emailClicks?: number;
  emailOpens?: number;
  repliedToEmail?: boolean;
  clickedCurrentProject?: boolean;
  /** A contacté le SAV en étant inquiet (signal négatif). */
  worriedSavContact?: boolean;
  /** Jours depuis la dernière action e-mail (pour le refroidissement), null si aucune. */
  emailDaysSinceLastAction?: number | null;
  /** Date de référence (injectée pour testabilité). */
  now: Date;
};

export type ScoredInvestor = {
  status: InvestorStatus;
  statusLabel: string;
  urgency: number; // 0-100
  multiplier: number; // 1.0 - 3.0
  priority: number; // 0-100
  temperature: 'hot' | 'warm' | 'cold';
  temperatureLabel: string;
  /** Nouvel inscrit dans la fenêtre de visibilité (7 j) → prime sur le score. */
  isNewLead: boolean;
  daysSinceSignup: number | null;
  /** Jours avant le remboursement le plus proche (statut E), null sinon. */
  nearestRepaymentDays: number | null;
  /** Jours depuis le 1er investissement (statut E), null sinon. */
  firstInvestmentDays: number | null;
  queueBucket: number; // ordre de traitement de la journée
  queueLabel: string;
  callGoal: string;
  /** 3 facteurs principaux à afficher (transparence). */
  factors: string[];
};

const DAY_MS = 86_400_000;

const STATUS_LABEL: Record<InvestorStatus, string> = {
  A: 'Inscription non finalisée',
  B: 'KYC non validé',
  C: 'Inscrit, jamais investi',
  D: 'Inactif ancien',
  E: 'Investisseur',
};

/** Fenêtre de visibilité d'un nouvel inscrit dans la file (objectif d'appel : sous 48h). */
const NEW_LEAD_WINDOW_DAYS = 7;
/** Fenêtre d'appel "nouvel investisseur" après le tout premier investissement. */
const NEW_INVESTOR_WINDOW_DAYS = 15;

const BUCKET: Record<number, { label: string; goal: string }> = {
  1: {
    label: 'Nouveau (7 jours)',
    goal: 'À rappeler vite (objectif sous 48h) : finaliser inscription/KYC, booker un RDV, ou présenter un projet.',
  },
  2: {
    label: 'Nouvel investisseur (1er invest. < 15 j)',
    goal: 'Appel de bienvenue : créer le lien, vérifier que tout s’est bien passé, répondre aux questions, recueillir un retour.',
  },
  3: {
    label: 'Réinvestissement — échéance proche',
    goal: 'Proposer le réinvestissement avant le remboursement (le moment roi).',
  },
  4: {
    label: 'Déblocage KYC',
    goal: 'Faire valider la pièce d’identité pour débloquer la capacité à investir.',
  },
  5: {
    label: 'Déblocage inscription',
    goal: 'Comprendre le blocage et accompagner la finalisation. Pas de vente.',
  },
  6: {
    label: 'Bienvenue / 1er investissement',
    goal: 'Créer le lien, répondre aux questions, présenter un projet (jamais investi).',
  },
  7: {
    label: 'Réactivation',
    goal: 'Réengager — surtout s’il y a un signal d’intérêt récent.',
  },
  8: {
    label: 'Relationnel',
    goal: 'Entretenir la relation / rétention. Créneau dédié, jamais au détriment de la conversion.',
  },
};

/** Coefficient de refroidissement des points d'engagement e-mail (section 7). */
function freshnessCoef(daysSinceEmail: number | null | undefined): number {
  if (daysSinceEmail == null) return 0;
  if (daysSinceEmail <= 3) return 1;
  if (daysSinceEmail <= 9) return 0.7;
  if (daysSinceEmail <= 20) return 0.4;
  return 0;
}

function valueMultiplier(totalInvested: number): number {
  if (totalInvested >= 30_000) return 3.0;
  if (totalInvested >= 15_000) return 2.4;
  if (totalInvested >= 8_000) return 1.9;
  if (totalInvested >= 3_000) return 1.5;
  if (totalInvested >= 500) return 1.2;
  return 1.0;
}

function clamp0to100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function determineStatus(input: ScoringInput, daysSinceSignup: number | null): InvestorStatus {
  if (!input.registrationComplete) return 'A';
  if (!input.onboardingComplete) return 'B';
  if (input.totalInvested <= 0) {
    return daysSinceSignup != null && daysSinceSignup <= 90 ? 'C' : 'D';
  }
  return 'E';
}

export function scoreInvestor(input: ScoringInput): ScoredInvestor {
  const daysSinceSignup =
    input.sahCreatedAt != null
      ? Math.floor((input.now.getTime() - new Date(input.sahCreatedAt).getTime()) / DAY_MS)
      : null;

  const status = determineStatus(input, daysSinceSignup);

  // --- Score d'urgence (section 5) ---
  let urgency = 0;

  // Statut de base
  const basePoints: Record<InvestorStatus, number> = { A: 30, B: 35, C: 22, D: 5, E: 15 };
  urgency += basePoints[status];

  // Échéance projet (statut E uniquement)
  const repay = input.nearestRepaymentDays;
  if (status === 'E' && repay != null) {
    if (repay <= 14) urgency += 45;
    else if (repay <= 30) urgency += 32;
    else if (repay <= 60) urgency += 18;
    else if (repay <= 120) urgency += 8;
  }

  // Ancienneté (statuts C et D)
  if ((status === 'C' || status === 'D') && daysSinceSignup != null) {
    if (daysSinceSignup <= 7) urgency += 12;
    else if (daysSinceSignup <= 30) urgency += 6;
    else if (daysSinceSignup > 90) urgency -= 10;
  }

  // Engagement e-mail (avec refroidissement) — 0 tant que non branché
  const coef = freshnessCoef(input.emailDaysSinceLastAction);
  if (coef > 0) {
    urgency += Math.min(20, (input.emailClicks ?? 0) * 5) * coef;
    urgency += Math.min(10, (input.emailOpens ?? 0) * 1) * coef;
    if (input.repliedToEmail) urgency += 18 * coef;
    if (input.clickedCurrentProject) urgency += 15 * coef;
  }

  // Signal négatif SAV
  if (input.worriedSavContact) urgency -= 12;

  urgency = clamp0to100(urgency);

  // --- Multiplicateur de valeur (section 6) ---
  const multiplier = valueMultiplier(input.totalInvested);

  // --- Priorité finale (section 8) ---
  const priority = clamp0to100(urgency * (0.5 + multiplier * 0.22));

  const temperature: ScoredInvestor['temperature'] =
    priority >= 70 ? 'hot' : priority >= 40 ? 'warm' : 'cold';
  const temperatureLabel =
    temperature === 'hot' ? 'Chaud' : temperature === 'warm' ? 'Tiède' : 'Froid';

  // --- Nouvel inscrit : visible 7 j dans la file (objectif d'appel sous 48h) ---
  const isNewLead =
    daysSinceSignup != null &&
    daysSinceSignup <= NEW_LEAD_WINDOW_DAYS &&
    (status === 'A' || status === 'B' || status === 'C');

  // Nouvel investisseur : tout premier investissement il y a < 15 j (appel de bienvenue).
  const first = input.firstInvestmentDays;
  const isNewInvestor = status === 'E' && first != null && first <= NEW_INVESTOR_WINDOW_DAYS;

  // --- File / bucket (ordre de traitement, section 9) ---
  let queueBucket: number;
  if (isNewLead) queueBucket = 1;
  else if (isNewInvestor) queueBucket = 2;
  else if (status === 'E' && repay != null && repay <= 30) queueBucket = 3;
  else if (status === 'B') queueBucket = 4;
  else if (status === 'A') queueBucket = 5;
  else if (status === 'C') queueBucket = 6;
  else if (status === 'D') queueBucket = 7;
  else queueBucket = 8;

  // --- Facteurs explicatifs (top 3) ---
  const factors: string[] = [];
  if (isNewInvestor && first != null) {
    factors.push(first === 0 ? '1er invest. aujourd’hui' : `1er invest. il y a ${first}j`);
  }
  if (status === 'E' && repay != null) {
    factors.push(`échéance dans ${repay}j`);
    if (input.activeProjectsCount > 1)
      factors.push(`${input.activeProjectsCount} projets en cours`);
  }
  factors.push(STATUS_LABEL[status]);
  if (daysSinceSignup != null && (status === 'A' || status === 'B' || status === 'C')) {
    factors.push(
      daysSinceSignup === 0 ? 'inscrit aujourd’hui' : `inscrit il y a ${daysSinceSignup}j`,
    );
  }
  if (input.totalInvested > 0) {
    factors.push(`${input.totalInvested.toLocaleString('fr-FR')} € investis`);
  }
  if (input.worriedSavContact) factors.push('⚠️ a contacté le SAV (rassurer d’abord)');

  const bucketInfo = BUCKET[queueBucket] ?? { label: '—', goal: '' };

  return {
    status,
    statusLabel: STATUS_LABEL[status],
    urgency,
    multiplier,
    priority,
    temperature,
    temperatureLabel,
    isNewLead,
    daysSinceSignup,
    nearestRepaymentDays: repay,
    firstInvestmentDays: first,
    queueBucket,
    queueLabel: bucketInfo.label,
    callGoal: bucketInfo.goal,
    factors: factors.slice(0, 3),
  };
}

/** Compare deux valeurs nullables en ordre CROISSANT, les null en dernier. */
function ascNullsLast(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

/**
 * Ordre de tri de la file d'appels : d'abord la file (bucket), puis un ordre
 * TEMPOREL logique à l'intérieur :
 * - file Réinvestissement (échéance) : échéance la plus proche d'abord (2j avant +2j).
 * - autres files (inscrits, KYC…) : inscrit le plus récent d'abord (contact frais = chaud).
 * La priorité (score) départage à égalité.
 */
export function compareForQueue(a: ScoredInvestor, b: ScoredInvestor): number {
  if (a.queueBucket !== b.queueBucket) return a.queueBucket - b.queueBucket;

  if (a.queueBucket === 2) {
    // Nouvel investisseur : 1er investissement le plus récent d'abord.
    const byFirst = ascNullsLast(a.firstInvestmentDays, b.firstInvestmentDays);
    if (byFirst !== 0) return byFirst;
  } else if (a.queueBucket === 3) {
    // Réinvestissement : échéance la plus proche d'abord (2j avant +2j).
    const byRepay = ascNullsLast(a.nearestRepaymentDays, b.nearestRepaymentDays);
    if (byRepay !== 0) return byRepay;
  } else {
    // Autres : inscrit le plus récent d'abord.
    const byRecency = ascNullsLast(a.daysSinceSignup, b.daysSinceSignup);
    if (byRecency !== 0) return byRecency;
  }
  return b.priority - a.priority;
}
