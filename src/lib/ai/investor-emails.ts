import 'server-only';
import { ANTHROPIC_MODELS, anthropic } from './anthropic';
import { EMAIL_BRAIN } from './prompts/email-brain';

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
  preheader: string;
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

// Instructions propres à la tâche (le cadre/voix/AMF vient du brain, chargé en système caché).
const TASK_INSTRUCTIONS = `INSTRUCTIONS POUR CETTE TÂCHE
Tu rédiges un email de PROPOSITION pour un investisseur de Seven At Home, en appliquant strictement l'Email Brain ci-dessus (voix, cadre AMF, matrice de statut, délivrabilité).

- Identifie le statut de l'investisseur (section 3 du brain) à partir des données fournies (total investi, montant évoqué, étape, score) et applique la ligne correspondante.
- N'utilise QUE les données projets fournies pour tout chiffre (nom, ville, rendement cible, durée). N'invente aucun chiffre, aucune date, aucune statistique, aucun chiffre de track record.
- Propose 1 à 2 projets pertinents parmi ceux fournis.
- Ne mets PAS de signature dans le corps : elle est ajoutée automatiquement ("Guillaume / Seven At Home"). Termine le corps sur ta dernière phrase utile.
- Objet : minuscule sauf la première lettre, 4 à 7 mots, sans emoji, sans chiffre ni symbole. Préheader : prolonge l'objet sans le répéter, jamais vide.

FORMAT DE SORTIE : réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balises de code :
{"subject": "...", "preheader": "...", "body": "corps en texte simple avec sauts de ligne \\n, SANS la signature finale"}`;

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
    preheader?: unknown;
    body?: unknown;
  };
  if (typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') {
    throw new Error('Réponse IA incomplète (objet ou corps manquant).');
  }
  return {
    subject: parsed.subject.trim(),
    preheader: typeof parsed.preheader === 'string' ? parsed.preheader.trim() : '',
    bodyText: parsed.body.trim(),
  };
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
    // Le brain est volumineux et stable → bloc système mis en cache (coût quasi nul aux appels suivants).
    system: [
      { type: 'text', text: EMAIL_BRAIN, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: TASK_INSTRUCTIONS },
    ],
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
