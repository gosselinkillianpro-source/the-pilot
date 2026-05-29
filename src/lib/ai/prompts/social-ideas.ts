/**
 * Prompt de génération d'idées de contenu social SAH.
 * Porté depuis sah-social/core/prompts.py (ideas_research_prompt).
 */

import { SAH_BRAND_SYSTEM, SAH_COMPETITORS } from './sah-brand';

export type EditorialMix = {
  projets: number;
  pedagogique: number;
  temoignages: number;
  mise_avant: number;
};

export const DEFAULT_EDITORIAL_MIX: EditorialMix = {
  projets: 30,
  pedagogique: 30,
  temoignages: 20,
  mise_avant: 20,
};

export type RecentIdeaLite = {
  title: string;
  angle: string;
  category: string | null;
  status: string;
};

export function buildIdeasPrompt(params: {
  n: number;
  mix: EditorialMix;
  memoryContext: string;
  recentIdeas: RecentIdeaLite[];
}): string {
  const { n, mix, memoryContext, recentIdeas } = params;

  const recent =
    recentIdeas.length > 0
      ? recentIdeas
          .map(
            (i) =>
              `- [${i.status}] ${i.title} (${i.category ?? '?'}) : ${(i.angle ?? '').slice(0, 160)}`,
          )
          .join('\n')
      : '(aucune idée précédente, tu peux explorer librement)';

  return `${SAH_BRAND_SYSTEM}

Tu es analyste social media pour Seven At Home. Génère ${n} idées de posts pour cette semaine (Facebook, Instagram, LinkedIn).

CHERCHE EN PRIORITÉ (web search activé, sources françaises) :
1. Actualité immobilière française des 14 derniers jours (taux, lois, marché, fiscalité)
2. Actualité investissement / épargne France récente
3. Tendances éditoriales LinkedIn/Instagram dans la niche immo-finance
4. Posts qui marchent chez les concurrents : ${SAH_COMPETITORS.join(', ')}

MIX ÉDITORIAL CIBLE (répartition approximative sur ${n} idées) :
- ${mix.projets}% projets SAH ouverts (présentation, avancement collecte, opportunités) — catégorie 'projets'
- ${mix.pedagogique}% pédagogique investissement immobilier (vulgarisation, fiscalité, "comment ça marche") — catégorie 'pedagogique'
- ${mix.temoignages}% témoignages, chiffres clés plateforme, preuves sociales — catégorie 'temoignages'
- ${mix.mise_avant}% mise en avant Seven (concept CO Opération, différenciateurs, news, fondateur, vision) — catégorie 'mise_avant'

CONTEXTE SEVEN AT HOME ACTUEL (références concrètes à utiliser ; ne jamais inventer de chiffre) :
${memoryContext}

IDÉES DÉJÀ PROPOSÉES RÉCEMMENT (ne propose ni doublon ni angle reformulé) :
${recent}

FORMAT DE SORTIE — JSON STRICT, sans aucun texte avant ni après :
{
  "ideas": [
    {
      "title": "Titre court et accrocheur (8-12 mots)",
      "category": "projets" | "pedagogique" | "temoignages" | "mise_avant",
      "angle": "Angle précis en 2-3 phrases : hook, enjeu, audience visée",
      "rationale": "Pourquoi maintenant : actu, tendance ou besoin éditorial",
      "sources": ["URL ou nom de source"]
    }
  ]
}`;
}

/** Extrait un objet JSON même si le modèle l'entoure de markdown ou de prose. */
export function extractJson(text: string): Record<string, unknown> {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as Record<string, unknown>;
    throw new Error('Réponse IA non parsable en JSON');
  }
}
