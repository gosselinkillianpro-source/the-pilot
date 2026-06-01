import 'server-only';
import { ANTHROPIC_MODELS, anthropic } from './anthropic';

export type InvestorContext = {
  firstName: string;
  segment: string;
  score: number;
  stage: string;
  totalInvested: number;
  amountMentioned?: number;
};

export type ProjectContext = {
  name: string;
  city: string;
  targetYieldAnnual: number;
  durationMonths: number;
  status: string;
};

export type InvestorEmailDraft = {
  subject: string;
  bodyText: string;
};

export type DraftResult = {
  draft: InvestorEmailDraft;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
};

/** Erreur dédiée : clé API absente (permet à l'action de renvoyer un message clair). */
export class MissingAnthropicKeyError extends Error {
  constructor() {
    super('NO_ANTHROPIC_KEY');
    this.name = 'MissingAnthropicKeyError';
  }
}

const SYSTEM_PROMPT = `Tu es le copywriter de Seven At Home, plateforme privée française d'investissement immobilier en club deal. Tu rédiges un email personnalisé d'un closer à un investisseur, en français, vouvoiement.

RÈGLES ABSOLUES (conformité AMF — non négociables) :
- N'INVENTE JAMAIS de chiffres. Utilise UNIQUEMENT les données projets fournies (nom, ville, rendement cible, durée). N'invente ni montant collecté, ni date, ni statistique.
- N'emploie JAMAIS les mots : "garanti", "garantie", "sans risque", "risque zéro", "sûr", "certain", "assuré", "crowdfunding", "financement participatif".
- Dès que tu cites un rendement, tu DOIS écrire juste à côté la mention exacte : "rendement cible, capital non garanti".
- Ton factuel, sobre, sans pression commerciale, sans superlatifs ni promesses. Pas d'urgence artificielle.
- N'évoque aucune donnée KYC sensible (pièce d'identité, RIB).

OBJECTIF : un email de proposition adapté à la situation de l'investisseur (score d'engagement, segment, montant déjà investi ou évoqué, étape dans le parcours). Propose 1 à 2 projets pertinents parmi ceux fournis. Court (120-180 mots), chaleureux mais professionnel.

FORMAT DE SORTIE : réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balises de code :
{"subject": "objet de l'email", "body": "corps de l'email en texte simple, avec sauts de ligne \\n"}
N'inclus PAS de formule de signature finale (elle est ajoutée automatiquement).`;

function buildUserPrompt(investor: InvestorContext, projects: ProjectContext[]): string {
  const investorBlock = [
    `Prénom: ${investor.firstName}`,
    `Segment: ${investor.segment}`,
    `Score d'engagement (0-100): ${investor.score}`,
    `Étape parcours: ${investor.stage}`,
    `Total déjà investi: ${investor.totalInvested} €`,
    investor.amountMentioned ? `Montant évoqué/simulé: ${investor.amountMentioned} €` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const projectsBlock = projects
    .map(
      (p) =>
        `- ${p.name} (${p.city}) — rendement cible ${p.targetYieldAnnual}% / an, durée ${p.durationMonths} mois, statut ${p.status}`,
    )
    .join('\n');

  return `INVESTISSEUR :\n${investorBlock}\n\nPROJETS DISPONIBLES (n'utilise que ces données chiffrées) :\n${projectsBlock}\n\nRédige l'email de proposition.`;
}

function parseDraft(raw: string): InvestorEmailDraft {
  // Retire d'éventuelles balises de code et isole le premier objet JSON.
  const cleaned = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('Réponse IA non parsable (pas de JSON).');
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
    subject?: unknown;
    body?: unknown;
  };
  if (typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') {
    throw new Error('Réponse IA incomplète (objet ou corps manquant).');
  }
  return { subject: parsed.subject.trim(), bodyText: parsed.body.trim() };
}

export async function draftProposalEmail(
  investor: InvestorContext,
  projects: ProjectContext[],
): Promise<DraftResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new MissingAnthropicKeyError();
  }

  const model = ANTHROPIC_MODELS.complex;
  const startedAt = Date.now();

  const response = await anthropic.messages.create({
    model,
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(investor, projects) }],
  });

  const latencyMs = Date.now() - startedAt;
  const textBlock = response.content.find((b) => b.type === 'text');
  const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
  const draft = parseDraft(raw);

  return {
    draft,
    model,
    promptTokens: response.usage.input_tokens,
    completionTokens: response.usage.output_tokens,
    latencyMs,
  };
}
