/**
 * Données fake pour visualiser l'app en attendant le branchement à SAH.
 * À REMPLACER par les données réelles SAH dès que l'intégration est faite
 * (cf. docs/appel-sah-questions.md).
 */

export type PipelineStage = 'new' | 'meeting' | 'proposal' | 'closed';

export type MockInvestor = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  score: number;
  stage: PipelineStage;
  totalInvested: number;
  amountMentioned?: number;
  segment: 'junior' | 'confirmed' | 'csp_plus' | 'executive';
  acquisitionSource: 'meta_ads' | 'google_ads' | 'linkedin_ads' | 'seo' | 'referral';
  registrationComplete: boolean;
  onboardingComplete: boolean;
  lastInteractionAt: string;
  avatarColor: 'blue' | 'purple' | 'green' | 'amber' | 'red';
  aiSuggested?: boolean;
};

export const mockInvestors: MockInvestor[] = [
  // Nouveau
  {
    id: 'inv-001',
    firstName: 'Émilie',
    lastName: 'Klein',
    email: 'e.klein@example.fr',
    score: 92,
    stage: 'new',
    totalInvested: 0,
    amountMentioned: 12000,
    segment: 'csp_plus',
    acquisitionSource: 'linkedin_ads',
    registrationComplete: true,
    onboardingComplete: true,
    lastInteractionAt: 'il y a 2h',
    avatarColor: 'purple',
    aiSuggested: true,
  },
  {
    id: 'inv-002',
    firstName: 'Marc',
    lastName: 'Dubois',
    email: 'm.dubois@example.fr',
    score: 78,
    stage: 'new',
    totalInvested: 0,
    amountMentioned: 5000,
    segment: 'confirmed',
    acquisitionSource: 'meta_ads',
    registrationComplete: true,
    onboardingComplete: false,
    lastInteractionAt: 'il y a 5h',
    avatarColor: 'blue',
  },
  {
    id: 'inv-003',
    firstName: 'Sophie',
    lastName: 'Martin',
    email: 's.martin@example.fr',
    score: 45,
    stage: 'new',
    totalInvested: 0,
    segment: 'junior',
    acquisitionSource: 'seo',
    registrationComplete: true,
    onboardingComplete: false,
    lastInteractionAt: 'hier',
    avatarColor: 'green',
  },
  {
    id: 'inv-004',
    firstName: 'Pierre',
    lastName: 'Rodriguez',
    email: 'p.rodriguez@example.fr',
    score: 38,
    stage: 'new',
    totalInvested: 0,
    segment: 'junior',
    acquisitionSource: 'google_ads',
    registrationComplete: true,
    onboardingComplete: false,
    lastInteractionAt: 'il y a 2j',
    avatarColor: 'amber',
  },
  // RDV pris
  {
    id: 'inv-005',
    firstName: 'Catherine',
    lastName: 'Lefèvre',
    email: 'c.lefevre@example.fr',
    score: 88,
    stage: 'meeting',
    totalInvested: 25000,
    amountMentioned: 15000,
    segment: 'executive',
    acquisitionSource: 'referral',
    registrationComplete: true,
    onboardingComplete: true,
    lastInteractionAt: "aujourd'hui",
    avatarColor: 'purple',
    aiSuggested: true,
  },
  {
    id: 'inv-006',
    firstName: 'Antoine',
    lastName: 'Bernard',
    email: 'a.bernard@example.fr',
    score: 72,
    stage: 'meeting',
    totalInvested: 8000,
    amountMentioned: 8000,
    segment: 'confirmed',
    acquisitionSource: 'linkedin_ads',
    registrationComplete: true,
    onboardingComplete: true,
    lastInteractionAt: 'il y a 3h',
    avatarColor: 'blue',
  },
  {
    id: 'inv-007',
    firstName: 'Marine',
    lastName: 'Petit',
    email: 'm.petit@example.fr',
    score: 65,
    stage: 'meeting',
    totalInvested: 5000,
    segment: 'confirmed',
    acquisitionSource: 'meta_ads',
    registrationComplete: true,
    onboardingComplete: true,
    lastInteractionAt: 'hier',
    avatarColor: 'green',
  },
  // Proposition
  {
    id: 'inv-008',
    firstName: 'Jean-Luc',
    lastName: 'Moreau',
    email: 'jl.moreau@example.fr',
    score: 84,
    stage: 'proposal',
    totalInvested: 30000,
    amountMentioned: 20000,
    segment: 'executive',
    acquisitionSource: 'referral',
    registrationComplete: true,
    onboardingComplete: true,
    lastInteractionAt: 'il y a 1h',
    avatarColor: 'purple',
  },
  {
    id: 'inv-009',
    firstName: 'Isabelle',
    lastName: 'Robert',
    email: 'i.robert@example.fr',
    score: 76,
    stage: 'proposal',
    totalInvested: 12000,
    amountMentioned: 10000,
    segment: 'csp_plus',
    acquisitionSource: 'meta_ads',
    registrationComplete: true,
    onboardingComplete: true,
    lastInteractionAt: 'il y a 4h',
    avatarColor: 'blue',
  },
  {
    id: 'inv-010',
    firstName: 'Thomas',
    lastName: 'Garnier',
    email: 't.garnier@example.fr',
    score: 81,
    stage: 'proposal',
    totalInvested: 18000,
    amountMentioned: 12000,
    segment: 'csp_plus',
    acquisitionSource: 'google_ads',
    registrationComplete: true,
    onboardingComplete: true,
    lastInteractionAt: "aujourd'hui",
    avatarColor: 'amber',
    aiSuggested: true,
  },
  // Closed
  {
    id: 'inv-011',
    firstName: 'Florence',
    lastName: 'Girard',
    email: 'f.girard@example.fr',
    score: 95,
    stage: 'closed',
    totalInvested: 45000,
    segment: 'executive',
    acquisitionSource: 'referral',
    registrationComplete: true,
    onboardingComplete: true,
    lastInteractionAt: 'hier',
    avatarColor: 'green',
  },
  {
    id: 'inv-012',
    firstName: 'Olivier',
    lastName: 'Nicolas',
    email: 'o.nicolas@example.fr',
    score: 89,
    stage: 'closed',
    totalInvested: 22000,
    segment: 'csp_plus',
    acquisitionSource: 'linkedin_ads',
    registrationComplete: true,
    onboardingComplete: true,
    lastInteractionAt: 'il y a 2j',
    avatarColor: 'blue',
  },
  {
    id: 'inv-013',
    firstName: 'Camille',
    lastName: 'Faure',
    email: 'c.faure@example.fr',
    score: 86,
    stage: 'closed',
    totalInvested: 15000,
    segment: 'confirmed',
    acquisitionSource: 'meta_ads',
    registrationComplete: true,
    onboardingComplete: true,
    lastInteractionAt: 'il y a 3j',
    avatarColor: 'purple',
  },
];

export type MockProject = {
  id: string;
  name: string;
  status: 'open' | 'funding' | 'funded' | 'in_operation' | 'completed';
  targetAmount: number;
  collectedAmount: number;
  targetYieldAnnual: number;
  durationMonths: number;
  city: string;
};

export const mockProjects: MockProject[] = [
  {
    id: 'p-1',
    name: 'Brézins',
    status: 'open',
    targetAmount: 480000,
    collectedAmount: 312000,
    targetYieldAnnual: 15,
    durationMonths: 12,
    city: 'Brézins',
  },
  {
    id: 'p-2',
    name: 'Capsule',
    status: 'funding',
    targetAmount: 620000,
    collectedAmount: 580000,
    targetYieldAnnual: 14,
    durationMonths: 18,
    city: 'Lyon',
  },
  {
    id: 'p-3',
    name: 'Haras',
    status: 'in_operation',
    targetAmount: 950000,
    collectedAmount: 950000,
    targetYieldAnnual: 15,
    durationMonths: 24,
    city: 'Chambéry',
  },
  {
    id: 'p-4',
    name: 'Moirans',
    status: 'open',
    targetAmount: 320000,
    collectedAmount: 180000,
    targetYieldAnnual: 16,
    durationMonths: 10,
    city: 'Moirans',
  },
];

export type MockAlert = {
  id: string;
  type: 'ai' | 'success' | 'warning' | 'danger';
  title: string;
  description: string;
};

export const mockAlerts: MockAlert[] = [
  {
    id: 'a-1',
    type: 'ai',
    title: '3 leads chauds détectés ce matin',
    description:
      "L'IA a identifié 3 inscrits avec un score > 80. Top : Émilie Klein (92), à appeler dans les 24h.",
  },
  {
    id: 'a-2',
    type: 'success',
    title: 'Souscription confirmée',
    description: 'Florence G. vient de souscrire 8 000€ sur Capsule.',
  },
  {
    id: 'a-3',
    type: 'warning',
    title: 'Budget IA à 82% pour ce mois',
    description: '1 240€ consommés sur 1 500€.',
  },
  {
    id: 'a-4',
    type: 'danger',
    title: 'Non-conformité AMF détectée',
    description: 'L\'email "Relance Capsule v2" contient le mot "garanti". Bloqué avant envoi.',
  },
];

export type MockTimelineEvent = {
  id: string;
  type: 'default' | 'ai' | 'action';
  time: string;
  title: string;
  description: string;
};

export const mockInvestorTimeline: MockTimelineEvent[] = [
  {
    id: 't-1',
    type: 'ai',
    time: "AUJOURD'HUI · 09:12",
    title: 'Score IA recalculé : 92',
    description: 'Signal fort détecté : 4 ouvertures + 2 clics sur Brézins en 48h.',
  },
  {
    id: 't-2',
    type: 'action',
    time: 'HIER · 18:42',
    title: 'Simulation projet Brézins',
    description: 'Simulation à 15 000€ sur 12 mois.',
  },
  {
    id: 't-3',
    type: 'default',
    time: 'HIER · 14:20',
    title: 'Email ouvert',
    description: '"Nos 3 projets actifs ce mois" — ouvert 3 fois.',
  },
  {
    id: 't-4',
    type: 'action',
    time: 'IL Y A 3 JOURS',
    title: 'DIC téléchargé',
    description: "Document d'information clé du projet Capsule.",
  },
  {
    id: 't-5',
    type: 'default',
    time: 'IL Y A 5 JOURS',
    title: 'Onboarding complété',
    description: 'KYC validé chez Seven At Home.',
  },
  {
    id: 't-6',
    type: 'default',
    time: 'IL Y A 7 JOURS',
    title: 'Inscription',
    description: 'Compte créé via campagne LinkedIn Ads.',
  },
];

export const mockKpis = {
  collectionMonth: { value: '142,4K€', trend: '+34%', trendDirection: 'up' as const, vs: 'vs M-1' },
  hotLeads: { value: '14', trend: '+3', trendDirection: 'up' as const, vs: 'vs hier' },
  averageTicket: { value: '8,4K€', trend: 'stable', trendDirection: 'flat' as const, vs: '' },
  cpaBlended: { value: '42€', trend: '+6%', trendDirection: 'down' as const, vs: 'vs M-1' },
  aiActions: { value: '847', trend: '+18%', trendDirection: 'up' as const, vs: 'ce mois' },
} as const;

export const STAGE_LABELS: Record<PipelineStage, string> = {
  new: 'Nouveau',
  meeting: 'RDV pris',
  proposal: 'Proposition',
  closed: 'Closed won',
};

export function getScoreClass(score: number): 'hot' | 'warm' | 'cold' {
  if (score >= 80) return 'hot';
  if (score >= 60) return 'warm';
  return 'cold';
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

/* ============================================================
   ROI PAR ACTION (attribution)
   ============================================================ */

export type ActionKind = 'call' | 'sms' | 'whatsapp' | 'email_manual' | 'email_auto';

export type ActionRoi = {
  kind: ActionKind;
  label: string;
  count: number; // nb d'actions réalisées ce mois
  conversions: number; // nb d'investissements attribués
  revenueGenerated: number; // € attribués
  avgDelayDays: number; // délai moyen action -> investissement
};

export const mockActionRoi: ActionRoi[] = [
  {
    kind: 'call',
    label: 'Appel sortant',
    count: 142,
    conversions: 38,
    revenueGenerated: 312000,
    avgDelayDays: 6.2,
  },
  {
    kind: 'whatsapp',
    label: 'WhatsApp',
    count: 89,
    conversions: 19,
    revenueGenerated: 124000,
    avgDelayDays: 3.8,
  },
  {
    kind: 'sms',
    label: 'SMS relance',
    count: 420,
    conversions: 47,
    revenueGenerated: 198000,
    avgDelayDays: 4.1,
  },
  {
    kind: 'email_manual',
    label: 'Email relance (manuel)',
    count: 340,
    conversions: 28,
    revenueGenerated: 142000,
    avgDelayDays: 8.5,
  },
  {
    kind: 'email_auto',
    label: 'Email automatique (flow)',
    count: 1240,
    conversions: 52,
    revenueGenerated: 187000,
    avgDelayDays: 12.0,
  },
];

export function actionConversionRate(a: ActionRoi): string {
  return `${((a.conversions / a.count) * 100).toFixed(1)}%`;
}

export function revenuePerAction(a: ActionRoi): number {
  return Math.round(a.revenueGenerated / a.count);
}

export const mockAttributionSummary = {
  totalAttributedRevenue: 963000, // somme des revenus attribués
  totalActions: 2231,
  totalConversions: 184,
  avgDelayDays: 6.9,
  topAction: 'Appel sortant',
  attributionModel: 'Multi-touch (linéaire) · fenêtre 30 jours',
} as const;

export type AttributedJourney = {
  id: string;
  investorName: string;
  amount: number;
  project: string;
  steps: { day: string; action: string; kind: ActionKind | 'investment' | 'behavior' }[];
};

export const mockAttributedJourneys: AttributedJourney[] = [
  {
    id: 'j-1',
    investorName: 'Jean D.',
    amount: 10000,
    project: 'Brézins',
    steps: [
      { day: '1 mai', action: 'Appel Guillaume (8 min)', kind: 'call' },
      { day: '3 mai', action: 'SMS relance Brézins', kind: 'sms' },
      { day: '5 mai', action: 'Clique sur Brézins (email)', kind: 'behavior' },
      { day: '6 mai', action: 'Simulation à 10 000€', kind: 'behavior' },
      { day: '8 mai', action: 'Investit 10 000€', kind: 'investment' },
    ],
  },
  {
    id: 'j-2',
    investorName: 'Catherine L.',
    amount: 15000,
    project: 'Capsule',
    steps: [
      { day: '12 avr', action: 'WhatsApp première prise de contact', kind: 'whatsapp' },
      { day: '18 avr', action: 'Appel Guillaume (12 min)', kind: 'call' },
      { day: '22 avr', action: 'Investit 15 000€', kind: 'investment' },
    ],
  },
  {
    id: 'j-3',
    investorName: 'Thomas G.',
    amount: 12000,
    project: 'Moirans',
    steps: [
      { day: '2 mai', action: 'Email automatique (rebond 11 mois)', kind: 'email_auto' },
      { day: '4 mai', action: 'SMS relance', kind: 'sms' },
      { day: '9 mai', action: 'Investit 12 000€', kind: 'investment' },
    ],
  },
];
