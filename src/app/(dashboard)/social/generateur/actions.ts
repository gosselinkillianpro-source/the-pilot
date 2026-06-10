'use server';

import { z } from 'zod';
import { scanAmfCompliance } from '@/lib/ai/amf-compliance';
import { buildBrainPostPrompt } from '@/lib/ai/prompts/brain-reseaux';
import { extractJson } from '@/lib/ai/prompts/social-ideas';
import { logAudit } from '@/lib/audit';
import { grokChat } from '@/lib/integrations/openrouter/client';
import { getSocialActor } from '@/lib/social/actor';
import { buildSocialMemoryContext } from '@/lib/social/context';
import { logLlmCall } from '@/lib/social/llm-log';

const schema = z.object({
  brief: z.string().trim().min(5).max(2000),
  objectif: z.string().trim().max(40).optional(),
  cible: z.string().trim().max(40).optional(),
});

export type BrainSlide = { file: string; layout: string; html: string };
export type BrainHook = { famille: string; texte: string };

export type BrainPostResult =
  | {
      ok: true;
      cadrage: string;
      objectif: string;
      cible: string;
      pilier: string;
      hooks: BrainHook[];
      hookRetenu: string;
      planJustification: string;
      slides: BrainSlide[];
      caption: string;
      flags: string[];
      amf: { compliant: boolean; issues: { match: string; suggestedFix: string }[] };
    }
  | { ok: false; message: string };

/**
 * Génère un post complet (slides HTML L1..L7 + caption) selon le Brain Réseaux.
 * Sortie éphémère : on renvoie tout au client pour aperçu + copie/téléchargement (Figma).
 */
export async function generateBrainPostAction(input: {
  brief: string;
  objectif?: string;
  cible?: string;
}): Promise<BrainPostResult> {
  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(input);
  } catch {
    return { ok: false, message: 'Brief invalide (5 à 2000 caractères).' };
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return { ok: false, message: "OPENROUTER_API_KEY manquante dans l'environnement." };
  }

  const actor = await getSocialActor();
  const memoryContext = await buildSocialMemoryContext();
  const { system, user } = buildBrainPostPrompt(parsed, memoryContext);
  const started = Date.now();

  let raw: string;
  try {
    raw = await grokChat(system, user, true);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Erreur de génération IA.' };
  }

  let data: Record<string, unknown>;
  try {
    data = extractJson(raw);
  } catch {
    return {
      ok: false,
      message: 'Réponse IA illisible (JSON). Réessaie, ou simplifie / raccourcis le brief.',
    };
  }

  const slidesRaw = Array.isArray(data.slides) ? data.slides : [];
  const slides: BrainSlide[] = slidesRaw
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return {
        file: typeof o.file === 'string' ? o.file : '',
        layout: typeof o.layout === 'string' ? o.layout : '',
        html: typeof o.html === 'string' ? o.html : '',
      };
    })
    .filter((s) => s.html.includes('<'));
  if (slides.length === 0) {
    return { ok: false, message: 'Aucune slide exploitable générée. Réessaie.' };
  }

  const caption = typeof data.caption === 'string' ? data.caption : '';
  const hooks: BrainHook[] = Array.isArray(data.hooks)
    ? data.hooks.map((h) => {
        const o = (h ?? {}) as Record<string, unknown>;
        return { famille: String(o.famille ?? ''), texte: String(o.texte ?? '') };
      })
    : [];
  const flags: string[] = Array.isArray(data.flags) ? data.flags.map((f) => String(f)) : [];

  // Vérification AMF (non bloquante, informative) sur la caption + le texte des slides.
  const scan = scanAmfCompliance(`${caption}\n${slides.map((s) => s.html).join('\n')}`);

  await logLlmCall({
    userId: actor.createdBy,
    provider: 'openrouter',
    model: 'grok',
    purpose: 'social.brain_post',
    status: 'success',
    latencyMs: Date.now() - started,
    inputSummary: parsed.brief.slice(0, 200),
  });
  await logAudit({
    userId: actor.createdBy,
    userEmail: actor.email,
    action: 'social.brain.generate',
    resourceType: 'social_post',
    resourceId: 'brain',
    metadata: { slides: slides.length, brief: parsed.brief.slice(0, 120) },
  });

  return {
    ok: true,
    cadrage: String(data.cadrage ?? ''),
    objectif: String(data.objectif ?? ''),
    cible: String(data.cible ?? ''),
    pilier: String(data.pilier ?? ''),
    hooks,
    hookRetenu: String(data.hookRetenu ?? ''),
    planJustification: String(data.planJustification ?? ''),
    slides,
    caption,
    flags,
    amf: {
      compliant: scan.compliant,
      issues: scan.issues.map((i) => ({ match: i.match, suggestedFix: i.suggestedFix })),
    },
  };
}
