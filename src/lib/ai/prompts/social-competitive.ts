/**
 * Prompts de veille concurrentielle SAH.
 * Port de sah-social/core/prompts.py (competitor_watch_prompt, competitor_to_ideas_prompt).
 */

import { SAH_BRAND_SYSTEM } from './sah-brand';

export function buildCompetitorWatchPrompt(competitor: string, memoryContext: string): string {
  return `Tu es analyste veille concurrentielle pour Seven At Home (SAH), plateforme française d'investissement immobilier en club deal.

Analyse la communication sociale et marketing récente (30 derniers jours) du concurrent : ${competitor}.

CHERCHE (web search activé, sources françaises) :
1. Posts récents LinkedIn, Instagram, Facebook
2. Page d'accueil et landing pages actuelles
3. Articles de blog / actualités récentes
4. Avis utilisateurs récents (Trustpilot, forums)

CONTEXTE SAH (pour identifier différenciation et inspiration) :
${memoryContext}

FORMAT — JSON STRICT sans texte autour :
{
  "competitor": "${competitor}",
  "summary": "Résumé exécutif du positionnement observé (2-3 phrases)",
  "top_angles": ["angle 1", "angle 2", "angle 3"],
  "best_topics": ["sujet 1", "sujet 2"],
  "tonality": "Description en 1 phrase",
  "formats": ["format 1", "format 2"],
  "opportunities_for_sah": ["opportunité concrète SAH 1", "opportunité 2"],
  "to_avoid": ["élément à ne pas reproduire"],
  "sources": ["url ou nom de source"]
}

Pas de tirets cadratins. Si une info manque, mets une chaîne ou liste vide.`;
}

export function buildCompetitorToIdeasPrompt(
  report: Record<string, unknown>,
  n: number,
  memoryContext: string,
): string {
  const competitor = typeof report.competitor === 'string' ? report.competitor : '?';
  const summary = typeof report.summary === 'string' ? report.summary : '';
  const topAngles = Array.isArray(report.top_angles) ? report.top_angles.join(', ') : '';
  const opportunities = Array.isArray(report.opportunities_for_sah)
    ? report.opportunities_for_sah.join('; ')
    : '';

  return `${SAH_BRAND_SYSTEM}

Transforme ce rapport de veille en ${n} idées de posts SAH inspirées mais DIFFÉRENTES (jamais une copie), 100% ADN SAH.

RAPPORT CONCURRENT
Concurrent : ${competitor}
Résumé : ${summary}
Angles qui marchent : ${topAngles}
Opportunités SAH identifiées : ${opportunities}

CONTEXTE SAH ACTUEL
${memoryContext}

RÈGLES
- S'inspirer sans copier. Ton SAH sobre/premium. Pas de "crowdfunding" / "financement participatif". Respect AMF.

FORMAT — JSON STRICT :
{
  "ideas": [
    {
      "title": "Titre court (8-12 mots)",
      "category": "projets" | "pedagogique" | "temoignages" | "mise_avant",
      "angle": "Angle SAH précis en 2-3 phrases",
      "rationale": "Inspiré de ${competitor} sur [thème], différencié par [angle SAH]"
    }
  ]
}`;
}
