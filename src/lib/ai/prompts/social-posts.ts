/**
 * Prompts de rédaction de posts et carrousels SAH.
 * Port de sah-social/core/prompts.py (post_prompt, carousel_prompt, image_prompt).
 */

import { SAH_BRAND_SYSTEM, SAH_PLATFORM_SPECS, type SahPlatform } from './sah-brand';

export type IdeaInput = {
  title: string;
  category: string | null;
  angle: string;
  rationale?: string | null;
};

/** Prompt système + user pour un post simple sur une plateforme. */
export function buildPostPrompt(
  platform: SahPlatform,
  idea: IdeaInput,
  memoryContext: string,
): { system: string; user: string } {
  const spec = SAH_PLATFORM_SPECS[platform];
  const system = `${SAH_BRAND_SYSTEM}

PLATEFORME : ${platform.toUpperCase()}
- Longueur cible : ${spec.longueurCible}
- Ton : ${spec.ton}
- Structure : ${spec.structure}
- Hashtags : ${spec.hashtags}`;

  const user = `IDÉE À DÉVELOPPER
Titre : ${idea.title}
Catégorie : ${idea.category ?? ''}
Angle : ${idea.angle}
Justification : ${idea.rationale ?? ''}

CONTEXTE SEVEN AT HOME ACTUEL (chiffres, projets, notes — n'invente jamais)
${memoryContext}

CONSIGNES
- Rédige UNIQUEMENT le texte du post pour ${platform}. Pas de titre, pas de meta, pas de "voici le post".
- Si un projet SAH actif est pertinent, utilise ses vraies données (n'invente jamais).
- Respecte les contraintes AMF. Pas de tirets cadratins. N'utilise jamais "crowdfunding" ni "financement participatif".`;

  return { system, user };
}

/** Prompt pour un carrousel à layouts variés (sortie JSON). */
export function buildCarouselPrompt(
  platform: SahPlatform,
  idea: IdeaInput,
  nSlides: number,
  memoryContext: string,
): { system: string; user: string } {
  const spec = SAH_PLATFORM_SPECS[platform];
  const system = `${SAH_BRAND_SYSTEM}

PLATEFORME : ${platform.toUpperCase()} (carrousel)
- Le carrousel raconte UNE histoire : slide 1 = hook, slides du milieu = développement riche, dernière = conclusion + CTA.
- Variété visuelle obligatoire : chaque slide a un layout DIFFÉRENT (jamais 2x de suite le même).
- Ton : ${spec.ton}`;

  const user = `IDÉE À DÉVELOPPER EN CARROUSEL (${nSlides} slides, layouts VARIÉS)
Titre : ${idea.title}
Catégorie : ${idea.category ?? ''}
Angle : ${idea.angle}

CONTEXTE SEVEN AT HOME ACTUEL (n'invente jamais de chiffre)
${memoryContext}

LAYOUTS DISPONIBLES (varie d'une slide à l'autre) :
- "hero" : intro, gros titre + paragraphe + encart highlight + cta. POUR LA SLIDE 1.
- "two_cards" : titre + 2 cards (label/title/body) + encart highlight.
- "bullets" : titre + card avec 3-5 points coches + encart dark (title + body).
- "mixed" : titre + 2 cards + 3 mini-cards (title court + label).
- "compare" : titre + card claire (label + bullets) + card sombre (label + title + body).
- "stats" : titre + 3 chiffres (value + label + sub).
- "cta_final" : conclusion, gros titre + body + cta. POUR LA DERNIÈRE SLIDE.

RÈGLES
- Chaque slide a "section_label" (2-4 mots majuscules) et "tag" (2-3 mots).
- Titres : mets 1-2 mots clés entre **étoiles** pour l'accent.
- Pas de tirets cadratins. Jamais "crowdfunding" / "financement participatif".
- Donne aussi une "caption" (texte du post sous le carrousel, ${spec.longueurCible}, ${spec.hashtags}).

FORMAT — JSON STRICT sans texte autour :
{
  "caption": "Texte du post",
  "slides": [
    { "layout": "hero", "section_label": "...", "tag": "...", "title": "Titre **clé**", "body": "...", "highlight": "...", "cta": "slide suivante" },
    { "layout": "two_cards", "section_label": "...", "tag": "...", "title": "...", "sub_cards": [{"label":"...","title":"...","body":"..."},{"label":"...","title":"...","body":"..."}], "highlight": "..." },
    { "layout": "cta_final", "section_label": "...", "tag": "...", "title": "...", "body": "...", "cta": "Rejoindre la communauté" }
  ]
}`;

  return { system, user };
}

/** Prompt image Nano Banana — photo premium SAH, format 4:5. */
export function buildImagePrompt(idea: IdeaInput): string {
  return `Generate a photorealistic premium image for a Seven At Home social media post.

CONTEXT
Title: ${idea.title}
Angle: ${idea.angle}

STYLE (strict)
- Premium, sober, elegant. No cheesy stock look.
- Palette: deep black (#1A1A1A), white, soft beige (#FBFAF7), gold accent (#DAC99A).
- High-end French architecture: Haussmann buildings, standing chalets, contemporary mansions, elegant urban lofts.
- Architecture-magazine photography: natural light, depth, balanced composition.
- No close-up faces. No text in the image.

FORMAT: 1080x1350 portrait (4:5), high resolution, magazine quality.`;
}
