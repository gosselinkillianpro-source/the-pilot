'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { scanAmfCompliance } from '@/lib/ai/amf-compliance';
import { SAH_PLATFORMS, type SahPlatform } from '@/lib/ai/prompts/sah-brand';
import { extractJson } from '@/lib/ai/prompts/social-ideas';
import {
  buildCarouselPrompt,
  buildImagePrompt,
  buildPostPrompt,
  type IdeaInput,
} from '@/lib/ai/prompts/social-posts';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { socialCarouselSlides, socialIdeas, socialPosts } from '@/lib/db/schema';
import { grokChat, nanoBananaImage } from '@/lib/integrations/openrouter/client';
import { buildSocialMemoryContext } from '@/lib/social/context';
import { logLlmCall } from '@/lib/social/llm-log';
import { uploadSocialImage } from '@/lib/social/storage';

async function currentActor(): Promise<{ id: string | null; email: string }> {
  try {
    const user = await getAuthenticatedUser();
    return { id: user.id, email: user.email };
  } catch {
    return { id: null, email: 'dev-local' };
  }
}

const idSchema = z.string().uuid();

async function loadIdea(ideaId: string): Promise<IdeaInput | null> {
  const rows = await db.select().from(socialIdeas).where(eq(socialIdeas.id, ideaId)).limit(1);
  const r = rows[0];
  if (!r) return null;
  return { title: r.title, category: r.category, angle: r.angle, rationale: r.rationale };
}

export type PostsGenResult = { ok: true; count: number } | { ok: false; message: string };

/* ---------- Génération de 3 posts simples (FB/IG/LinkedIn) ---------- */
export async function generatePostsAction(input: {
  ideaId: string;
  withImage: boolean;
}): Promise<PostsGenResult> {
  const ideaId = idSchema.parse(input.ideaId);
  const actor = await currentActor();
  if (!process.env.OPENROUTER_API_KEY) {
    return { ok: false, message: 'OPENROUTER_API_KEY manquante dans .env.local' };
  }
  const idea = await loadIdea(ideaId);
  if (!idea) return { ok: false, message: 'Idée introuvable' };

  const memoryContext = await buildSocialMemoryContext();
  const started = Date.now();

  // 3 textes en parallèle
  const texts = await Promise.all(
    SAH_PLATFORMS.map(async (platform) => {
      const { system, user } = buildPostPrompt(platform, idea, memoryContext);
      const raw = await grokChat(system, user);
      let text = raw.trim();
      if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).trim();
      return { platform, text };
    }),
  ).catch((e) => {
    throw e instanceof Error ? e : new Error('Erreur génération texte');
  });

  // Image optionnelle
  let imagePath: string | null = null;
  let imagePrompt: string | null = null;
  if (input.withImage) {
    try {
      imagePrompt = buildImagePrompt(idea);
      const { buffer, mime } = await nanoBananaImage(imagePrompt);
      imagePath = await uploadSocialImage(buffer, mime, `post-${ideaId}`);
    } catch {
      // L'échec image ne casse pas la génération texte (mode HTML/CSS par défaut)
      imagePath = null;
    }
  }

  await logLlmCall({
    userId: actor.id,
    provider: 'openrouter',
    model: 'grok',
    purpose: 'social.posts',
    status: 'success',
    latencyMs: Date.now() - started,
    inputSummary: idea.title,
  });

  const noImage = !imagePath;
  for (const { platform, text } of texts) {
    const scan = scanAmfCompliance(text);
    await db.insert(socialPosts).values({
      ideaId,
      platform,
      text,
      isCarousel: false,
      noImage,
      imagePath,
      imagePrompt,
      status: 'draft',
      amfPassed: scan.compliant,
      amfIssues: scan.issues.length > 0 ? scan.issues : null,
      createdBy: actor.id,
    });
  }
  await db.update(socialIdeas).set({ status: 'validated' }).where(eq(socialIdeas.id, ideaId));

  await logAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: 'social.posts.generate',
    resourceType: 'social_post',
    resourceId: ideaId,
    metadata: { count: texts.length, withImage: !noImage },
  });

  revalidatePath('/social/posts');
  return { ok: true, count: texts.length };
}

/* ---------- Génération de carrousels (3 plateformes) ---------- */
export async function generateCarouselAction(input: {
  ideaId: string;
  nSlides: number;
}): Promise<PostsGenResult> {
  const ideaId = idSchema.parse(input.ideaId);
  const nSlides = z.number().int().min(3).max(10).parse(input.nSlides);
  const actor = await currentActor();
  if (!process.env.OPENROUTER_API_KEY) {
    return { ok: false, message: 'OPENROUTER_API_KEY manquante dans .env.local' };
  }
  const idea = await loadIdea(ideaId);
  if (!idea) return { ok: false, message: 'Idée introuvable' };

  const memoryContext = await buildSocialMemoryContext();
  const started = Date.now();

  const perPlatform = await Promise.all(
    SAH_PLATFORMS.map(async (platform) => {
      const { system, user } = buildCarouselPrompt(platform, idea, nSlides, memoryContext);
      const raw = await grokChat(system, user, true);
      const parsed = extractJson(raw);
      const slides = Array.isArray(parsed.slides) ? parsed.slides : [];
      const caption = typeof parsed.caption === 'string' ? parsed.caption : '';
      return { platform, slides, caption };
    }),
  ).catch((e) => {
    throw e instanceof Error ? e : new Error('Erreur génération carrousel');
  });

  await logLlmCall({
    userId: actor.id,
    provider: 'openrouter',
    model: 'grok',
    purpose: 'social.carousel',
    status: 'success',
    latencyMs: Date.now() - started,
    inputSummary: idea.title,
  });

  let created = 0;
  for (const { platform, slides, caption } of perPlatform) {
    if (slides.length === 0) continue;
    const scan = scanAmfCompliance(caption);
    const inserted = await db
      .insert(socialPosts)
      .values({
        ideaId,
        platform: platform as SahPlatform,
        text: caption,
        isCarousel: true,
        noImage: true,
        status: 'draft',
        amfPassed: scan.compliant,
        amfIssues: scan.issues.length > 0 ? scan.issues : null,
        createdBy: actor.id,
      })
      .returning({ id: socialPosts.id });
    const postId = inserted[0]?.id;
    if (!postId) continue;
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i] as Record<string, unknown>;
      const { title, body, ...extra } = s;
      await db.insert(socialCarouselSlides).values({
        postId,
        slideIndex: i,
        title: typeof title === 'string' ? title : '',
        body: typeof body === 'string' ? body : null,
        extra,
      });
    }
    created += 1;
  }
  await db.update(socialIdeas).set({ status: 'validated' }).where(eq(socialIdeas.id, ideaId));

  await logAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: 'social.carousel.generate',
    resourceType: 'social_post',
    resourceId: ideaId,
    metadata: { carousels: created, nSlides },
  });

  revalidatePath('/social/posts');
  return { ok: true, count: created };
}

/* ---------- Édition / statut / planning ---------- */
export async function updatePostTextAction(postId: string, text: string) {
  const id = idSchema.parse(postId);
  const scan = scanAmfCompliance(text);
  await db
    .update(socialPosts)
    .set({
      text: text.trim(),
      amfPassed: scan.compliant,
      amfIssues: scan.issues.length > 0 ? scan.issues : null,
      updatedAt: new Date(),
    })
    .where(eq(socialPosts.id, id));
  revalidatePath('/social/posts');
}

export type SetStatusResult = { ok: true } | { ok: false; message: string };

export async function setPostStatusAction(
  postId: string,
  status: 'draft' | 'ready' | 'published',
): Promise<SetStatusResult> {
  const id = idSchema.parse(postId);
  const actor = await currentActor();

  // Garde AMF : on ne passe pas "prêt"/"publié" si le contenu n'est pas conforme.
  if (status !== 'draft') {
    const rows = await db
      .select({ amfPassed: socialPosts.amfPassed, text: socialPosts.text })
      .from(socialPosts)
      .where(eq(socialPosts.id, id))
      .limit(1);
    const row = rows[0];
    if (row) {
      const scan = scanAmfCompliance(row.text);
      if (!scan.compliant) {
        return {
          ok: false,
          message: `Bloqué AMF : ${scan.issues.map((i) => i.match).join(', ')}`,
        };
      }
    }
  }

  await db.update(socialPosts).set({ status, updatedAt: new Date() }).where(eq(socialPosts.id, id));
  await logAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: `social.post.${status}`,
    resourceType: 'social_post',
    resourceId: id,
  });
  revalidatePath('/social/posts');
  return { ok: true };
}

export async function schedulePostAction(postId: string, date: string, time: string) {
  const id = idSchema.parse(postId);
  await db
    .update(socialPosts)
    .set({ scheduledDate: date || null, scheduledTime: time || null, updatedAt: new Date() })
    .where(eq(socialPosts.id, id));
  revalidatePath('/social/posts');
}

export async function deletePostAction(postId: string) {
  const id = idSchema.parse(postId);
  const actor = await currentActor();
  await db.delete(socialPosts).where(eq(socialPosts.id, id));
  await logAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: 'social.post.delete',
    resourceType: 'social_post',
    resourceId: id,
  });
  revalidatePath('/social/posts');
}

export async function toggleImageModeAction(postId: string, noImage: boolean) {
  const id = idSchema.parse(postId);
  await db
    .update(socialPosts)
    .set({ noImage, updatedAt: new Date() })
    .where(eq(socialPosts.id, id));
  revalidatePath('/social/posts');
}

/* ---------- (Re)génération d'image pour un post ---------- */
export async function regenerateImageAction(postId: string): Promise<SetStatusResult> {
  const id = idSchema.parse(postId);
  if (!process.env.OPENROUTER_API_KEY) {
    return { ok: false, message: 'OPENROUTER_API_KEY manquante' };
  }
  const rows = await db
    .select({
      ideaTitle: socialIdeas.title,
      ideaAngle: socialIdeas.angle,
      ideaCategory: socialIdeas.category,
    })
    .from(socialPosts)
    .leftJoin(socialIdeas, eq(socialIdeas.id, socialPosts.ideaId))
    .where(eq(socialPosts.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, message: 'Post introuvable' };

  try {
    const prompt = buildImagePrompt({
      title: row.ideaTitle ?? 'Seven At Home',
      angle: row.ideaAngle ?? '',
      category: row.ideaCategory,
    });
    const { buffer, mime } = await nanoBananaImage(prompt);
    const path = await uploadSocialImage(buffer, mime, `post-${id}`);
    await db
      .update(socialPosts)
      .set({ imagePath: path, imagePrompt: prompt, noImage: false, updatedAt: new Date() })
      .where(eq(socialPosts.id, id));
    revalidatePath('/social/posts');
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Échec génération image' };
  }
}

/* ---------- Import d'une image manuelle (FormData) ---------- */
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function uploadPostImageAction(
  postId: string,
  formData: FormData,
): Promise<SetStatusResult> {
  const id = idSchema.parse(postId);
  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, message: 'Aucun fichier' };
  if (!ALLOWED_IMAGE_MIME.has(file.type)) {
    return { ok: false, message: 'Format non supporté (jpg, png, webp)' };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { ok: false, message: 'Image trop lourde (max 8 Mo)' };
  }
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const path = await uploadSocialImage(buffer, file.type, `post-${id}-upload`);
    await db
      .update(socialPosts)
      .set({
        imagePath: path,
        imagePrompt: '(image importée manuellement)',
        noImage: false,
        updatedAt: new Date(),
      })
      .where(eq(socialPosts.id, id));
    revalidatePath('/social/posts');
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec de l'import" };
  }
}

/* ---------- Régénération du texte d'un post (1 plateforme) ---------- */
export async function regeneratePostTextAction(postId: string): Promise<SetStatusResult> {
  const id = idSchema.parse(postId);
  if (!process.env.OPENROUTER_API_KEY) {
    return { ok: false, message: 'OPENROUTER_API_KEY manquante' };
  }
  const rows = await db
    .select({
      platform: socialPosts.platform,
      isCarousel: socialPosts.isCarousel,
      ideaTitle: socialIdeas.title,
      ideaAngle: socialIdeas.angle,
      ideaCategory: socialIdeas.category,
      ideaRationale: socialIdeas.rationale,
    })
    .from(socialPosts)
    .leftJoin(socialIdeas, eq(socialIdeas.id, socialPosts.ideaId))
    .where(eq(socialPosts.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, message: 'Post introuvable' };
  if (row.isCarousel)
    return { ok: false, message: 'Régénération texte non dispo pour un carrousel' };

  const idea: IdeaInput = {
    title: row.ideaTitle ?? 'Seven At Home',
    category: row.ideaCategory,
    angle: row.ideaAngle ?? '',
    rationale: row.ideaRationale,
  };
  const memoryContext = await buildSocialMemoryContext();
  try {
    const { system, user } = buildPostPrompt(row.platform as SahPlatform, idea, memoryContext);
    const raw = await grokChat(system, user);
    let text = raw.trim();
    if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).trim();
    const scan = scanAmfCompliance(text);
    await db
      .update(socialPosts)
      .set({
        text,
        amfPassed: scan.compliant,
        amfIssues: scan.issues.length > 0 ? scan.issues : null,
        updatedAt: new Date(),
      })
      .where(eq(socialPosts.id, id));
    revalidatePath('/social/posts');
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Échec régénération' };
  }
}
