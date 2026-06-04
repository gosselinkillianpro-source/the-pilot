import 'server-only';
import { ANTHROPIC_MODELS, anthropic } from './anthropic';

/**
 * Brief d'appel IA : un script court prêt-à-appeler pour le closer, calé sur le
 * statut de l'investisseur (file/but de l'appel) et les projets réellement ouverts.
 * Aide à la préparation — le closer garde la main. Aucun chiffre inventé.
 */

export type CallBriefContext = {
  firstName: string;
  statusLabel: string;
  queueLabel: string;
  callGoal: string;
  factors: string[];
  totalInvested: number;
};

export type CallBriefProject = {
  name: string;
  city: string;
  targetYieldAnnual: number;
  durationMonths: number;
};

export type CallBrief = {
  accroche: string;
  objectif: string;
  points: string[];
  objections: { objection: string; reponse: string }[];
  projets: string[];
};

export type CallBriefResult = {
  brief: CallBrief;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
};

export class MissingAnthropicKeyError extends Error {
  constructor() {
    super('NO_ANTHROPIC_KEY');
    this.name = 'MissingAnthropicKeyError';
  }
}

const SYSTEM = `Tu prépares un BRIEF D'APPEL pour un closer de Seven At Home (plateforme privée d'investissement immobilier en club deal).

CADRE LÉGAL (AMF) — STRICT :
- Jamais les mots : garanti, garantie, sans risque, risque zéro, sûr, certain, assuré, crowdfunding, financement participatif.
- Tout rendement cité est un "rendement cible, capital non garanti".
- N'invente AUCUN chiffre : utilise uniquement les projets/données fournis.

STYLE : concret, court, orienté action. Le closer doit pouvoir lire le brief en 15 secondes avant d'appeler. Adapte le ton au but de l'appel (déblocage administratif ≠ réinvestissement ≠ premier investissement).

FORMAT DE SORTIE : réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balises de code :
{"accroche": "1 phrase d'ouverture personnalisée", "objectif": "le but concret de cet appel en 1 phrase", "points": ["3 à 4 points clés à aborder"], "objections": [{"objection": "...", "reponse": "..."}], "projets": ["nom du/des projet(s) à évoquer si pertinent"]}`;

function buildPrompt(ctx: CallBriefContext, projects: CallBriefProject[]): string {
  const projectsBlock = projects.length
    ? projects
        .map(
          (p) =>
            `- ${p.name} (${p.city}) — rendement cible ${p.targetYieldAnnual}% / an, durée ${p.durationMonths} mois`,
        )
        .join('\n')
    : '(aucun projet ouvert actuellement)';

  return `INVESTISSEUR :
Prénom: ${ctx.firstName}
Statut: ${ctx.statusLabel}
File d'appel: ${ctx.queueLabel}
But de l'appel: ${ctx.callGoal}
Facteurs clés: ${ctx.factors.join(', ')}
Total déjà investi: ${ctx.totalInvested} €

PROJETS OUVERTS (n'utilise que ces données chiffrées) :
${projectsBlock}

Rédige le brief d'appel.`;
}

function parseBrief(raw: string): CallBrief {
  const cleaned = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Réponse IA non parsable.');
  const p = JSON.parse(cleaned.slice(start, end + 1)) as Partial<CallBrief>;
  return {
    accroche: typeof p.accroche === 'string' ? p.accroche : '',
    objectif: typeof p.objectif === 'string' ? p.objectif : '',
    points: Array.isArray(p.points)
      ? p.points.filter((x): x is string => typeof x === 'string')
      : [],
    objections: Array.isArray(p.objections)
      ? p.objections
          .filter(
            (o): o is { objection: string; reponse: string } =>
              !!o && typeof o.objection === 'string' && typeof o.reponse === 'string',
          )
          .map((o) => ({ objection: o.objection, reponse: o.reponse }))
      : [],
    projets: Array.isArray(p.projets)
      ? p.projets.filter((x): x is string => typeof x === 'string')
      : [],
  };
}

export async function draftCallBrief(
  ctx: CallBriefContext,
  projects: CallBriefProject[],
): Promise<CallBriefResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new MissingAnthropicKeyError();

  const model = ANTHROPIC_MODELS.complex;
  const startedAt = Date.now();
  const response = await anthropic.messages.create({
    model,
    max_tokens: 900,
    system: [{ type: 'text', text: SYSTEM }],
    messages: [{ role: 'user', content: buildPrompt(ctx, projects) }],
  });
  const latencyMs = Date.now() - startedAt;
  const textBlock = response.content.find((b) => b.type === 'text');
  const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
  return {
    brief: parseBrief(raw),
    model,
    promptTokens: response.usage.input_tokens,
    completionTokens: response.usage.output_tokens,
    latencyMs,
  };
}
