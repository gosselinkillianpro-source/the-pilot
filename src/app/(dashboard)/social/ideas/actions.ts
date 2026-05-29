'use server';

import { desc, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SAH_IDEA_CATEGORIES } from '@/lib/ai/prompts/sah-brand';
import {
  buildIdeasPrompt,
  DEFAULT_EDITORIAL_MIX,
  extractJson,
} from '@/lib/ai/prompts/social-ideas';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { socialIdeas } from '@/lib/db/schema';
import { grokSearch } from '@/lib/integrations/openrouter/client';
import { buildSocialMemoryContext } from '@/lib/social/context';
import { logLlmCall } from '@/lib/social/llm-log';

/** Auth best-effort tant que le login n'est pas branché (aligné sur le module email). */
async function currentActor(): Promise<{ id: string | null; email: string }> {
  try {
    const user = await getAuthenticatedUser();
    return { id: user.id, email: user.email };
  } catch {
    return { id: null, email: 'dev-local' };
  }
}

const generateSchema = z.object({ n: z.number().int().min(3).max(25).default(10) });

export type GenerateIdeasResult = { ok: true; inserted: number } | { ok: false; message: string };

function isIdeaCategory(value: unknown): value is (typeof SAH_IDEA_CATEGORIES)[number] {
  return typeof value === 'string' && (SAH_IDEA_CATEGORIES as readonly string[]).includes(value);
}

export async function generateIdeasAction(input: { n: number }): Promise<GenerateIdeasResult> {
  const actor = await currentActor();
  const parsed = generateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Paramètres invalides' };
  const { n } = parsed.data;

  if (!process.env.OPENROUTER_API_KEY) {
    return { ok: false, message: 'OPENROUTER_API_KEY manquante dans .env.local' };
  }

  const memoryContext = await buildSocialMemoryContext();
  const recent = await db
    .select({
      title: socialIdeas.title,
      angle: socialIdeas.angle,
      category: socialIdeas.category,
      status: socialIdeas.status,
    })
    .from(socialIdeas)
    .orderBy(desc(socialIdeas.createdAt))
    .limit(80);

  const prompt = buildIdeasPrompt({
    n,
    mix: DEFAULT_EDITORIAL_MIX,
    memoryContext,
    recentIdeas: recent,
  });

  const started = Date.now();
  let raw: string;
  try {
    raw = await grokSearch(prompt, 8);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur génération';
    await logLlmCall({
      userId: actor.id,
      provider: 'openrouter',
      model: 'grok',
      purpose: 'social.ideas',
      status: 'error',
      latencyMs: Date.now() - started,
      errorMessage: message,
    });
    return { ok: false, message };
  }

  await logLlmCall({
    userId: actor.id,
    provider: 'openrouter',
    model: 'grok',
    purpose: 'social.ideas',
    status: 'success',
    latencyMs: Date.now() - started,
    inputSummary: `n=${n}`,
    outputSummary: raw.slice(0, 500),
  });

  let ideas: unknown;
  try {
    ideas = extractJson(raw).ideas;
  } catch {
    return { ok: false, message: 'Réponse IA non exploitable (JSON invalide)' };
  }
  if (!Array.isArray(ideas) || ideas.length === 0) {
    return { ok: false, message: 'Aucune idée générée' };
  }

  let inserted = 0;
  for (const item of ideas) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title.trim().slice(0, 200) : '';
    const angle = typeof obj.angle === 'string' ? obj.angle.trim() : '';
    if (!title || !angle) continue;
    const sources = Array.isArray(obj.sources) ? obj.sources.join('\n') : '';
    await db.insert(socialIdeas).values({
      title,
      angle,
      rationale: typeof obj.rationale === 'string' ? obj.rationale.trim() : null,
      category: isIdeaCategory(obj.category) ? obj.category : null,
      status: 'pending',
      sourceResearch: sources || null,
      createdBy: actor.id,
    });
    inserted += 1;
  }

  await logAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: 'social.ideas.generate',
    resourceType: 'social_idea',
    resourceId: 'batch',
    metadata: { requested: n, inserted },
  });

  revalidatePath('/social/ideas');
  return { ok: true, inserted };
}

const idSchema = z.string().uuid();

async function setStatus(ideaId: string, status: 'pending' | 'validated' | 'rejected') {
  const id = idSchema.parse(ideaId);
  const actor = await currentActor();
  await db.update(socialIdeas).set({ status }).where(eq(socialIdeas.id, id));
  await logAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: `social.idea.${status}`,
    resourceType: 'social_idea',
    resourceId: id,
  });
  revalidatePath('/social/ideas');
}

export async function validateIdeaAction(ideaId: string) {
  await setStatus(ideaId, 'validated');
}

export async function rejectIdeaAction(ideaId: string) {
  await setStatus(ideaId, 'rejected');
}

export async function unvalidateIdeaAction(ideaId: string) {
  await setStatus(ideaId, 'pending');
}

export async function deleteIdeaAction(ideaId: string) {
  const id = idSchema.parse(ideaId);
  const actor = await currentActor();
  await db.delete(socialIdeas).where(eq(socialIdeas.id, id));
  await logAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: 'social.idea.delete',
    resourceType: 'social_idea',
    resourceId: id,
  });
  revalidatePath('/social/ideas');
}

export async function togglePriorityAction(ideaId: string, current: boolean) {
  const id = idSchema.parse(ideaId);
  await db.update(socialIdeas).set({ priority: !current }).where(eq(socialIdeas.id, id));
  revalidatePath('/social/ideas');
}

export async function clearRejectedAction() {
  const actor = await currentActor();
  const rejected = await db
    .select({ id: socialIdeas.id })
    .from(socialIdeas)
    .where(eq(socialIdeas.status, 'rejected'));
  if (rejected.length > 0) {
    await db.delete(socialIdeas).where(
      inArray(
        socialIdeas.id,
        rejected.map((r) => r.id),
      ),
    );
  }
  await logAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: 'social.ideas.clear_rejected',
    resourceType: 'social_idea',
    resourceId: 'batch',
    metadata: { deleted: rejected.length },
  });
  revalidatePath('/social/ideas');
}
