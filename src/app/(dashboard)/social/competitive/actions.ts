'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SAH_COMPETITORS, SAH_IDEA_CATEGORIES } from '@/lib/ai/prompts/sah-brand';
import {
  buildCompetitorToIdeasPrompt,
  buildCompetitorWatchPrompt,
} from '@/lib/ai/prompts/social-competitive';
import { extractJson } from '@/lib/ai/prompts/social-ideas';
import { logAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { socialCompetitorReports, socialIdeas } from '@/lib/db/schema';
import { grokSearch } from '@/lib/integrations/openrouter/client';
import { getSocialActor } from '@/lib/social/actor';
import { buildSocialMemoryContext } from '@/lib/social/context';
import { logLlmCall } from '@/lib/social/llm-log';

const currentActor = getSocialActor;

function weekStart(): string {
  // Lundi de la semaine courante (ISO date). Date pure, pas d'heure.
  const now = new Date();
  const day = (now.getUTCDay() + 6) % 7; // 0 = lundi
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day),
  );
  return monday.toISOString().slice(0, 10);
}

export type WatchResult = { ok: true; analyzed: number } | { ok: false; message: string };

export async function runCompetitorWatchAction(): Promise<WatchResult> {
  const actor = await currentActor();
  if (!process.env.OPENROUTER_API_KEY) {
    return { ok: false, message: 'OPENROUTER_API_KEY manquante dans .env.local' };
  }
  const memoryContext = await buildSocialMemoryContext();
  const week = weekStart();
  const started = Date.now();

  const results = await Promise.allSettled(
    SAH_COMPETITORS.map(async (competitor) => {
      const raw = await grokSearch(buildCompetitorWatchPrompt(competitor, memoryContext), 10);
      return { competitor, report: extractJson(raw) };
    }),
  );

  let analyzed = 0;
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    await db.insert(socialCompetitorReports).values({
      competitor: r.value.competitor,
      report: r.value.report,
      weekStart: week,
    });
    analyzed += 1;
  }

  await logLlmCall({
    userId: actor.createdBy,
    provider: 'openrouter',
    model: 'grok',
    purpose: 'social.competitor_watch',
    status: analyzed > 0 ? 'success' : 'error',
    latencyMs: Date.now() - started,
    inputSummary: `${SAH_COMPETITORS.length} concurrents`,
  });

  await logAudit({
    userId: actor.createdBy,
    userEmail: actor.email,
    action: 'social.competitor.watch',
    resourceType: 'social_competitor_report',
    resourceId: 'batch',
    metadata: { analyzed, week },
  });

  if (analyzed === 0) return { ok: false, message: 'Aucune analyse aboutie (voir logs)' };
  revalidatePath('/social/competitive');
  return { ok: true, analyzed };
}

export async function deleteReportAction(reportId: string) {
  const id = z.string().uuid().parse(reportId);
  await db.delete(socialCompetitorReports).where(eq(socialCompetitorReports.id, id));
  revalidatePath('/social/competitive');
}

function isIdeaCategory(v: unknown): v is (typeof SAH_IDEA_CATEGORIES)[number] {
  return typeof v === 'string' && (SAH_IDEA_CATEGORIES as readonly string[]).includes(v);
}

export type ToIdeasResult = { ok: true; inserted: number } | { ok: false; message: string };

export async function competitorToIdeasAction(input: {
  reportId: string;
  n: number;
}): Promise<ToIdeasResult> {
  const reportId = z.string().uuid().parse(input.reportId);
  const n = z.number().int().min(1).max(10).parse(input.n);
  const actor = await currentActor();
  if (!process.env.OPENROUTER_API_KEY) {
    return { ok: false, message: 'OPENROUTER_API_KEY manquante' };
  }

  const rows = await db
    .select()
    .from(socialCompetitorReports)
    .where(eq(socialCompetitorReports.id, reportId))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, message: 'Rapport introuvable' };

  const report = (row.report ?? {}) as Record<string, unknown>;
  if (!report.competitor) report.competitor = row.competitor;
  const memoryContext = await buildSocialMemoryContext();

  let raw: string;
  try {
    raw = await grokSearch(buildCompetitorToIdeasPrompt(report, n, memoryContext), 0);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Erreur génération' };
  }

  let ideas: unknown;
  try {
    ideas = extractJson(raw).ideas;
  } catch {
    return { ok: false, message: 'Réponse IA non exploitable' };
  }
  if (!Array.isArray(ideas)) return { ok: false, message: 'Aucune idée générée' };

  let inserted = 0;
  for (const item of ideas) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title.trim().slice(0, 200) : '';
    const angle = typeof obj.angle === 'string' ? obj.angle.trim() : '';
    if (!title || !angle) continue;
    await db.insert(socialIdeas).values({
      title,
      angle,
      rationale: typeof obj.rationale === 'string' ? obj.rationale.trim() : null,
      category: isIdeaCategory(obj.category) ? obj.category : null,
      status: 'pending',
      sourceResearch: `Veille concurrent : ${row.competitor}`,
      fromCompetitor: row.competitor,
      createdBy: actor.createdBy,
    });
    inserted += 1;
  }

  await logAudit({
    userId: actor.createdBy,
    userEmail: actor.email,
    action: 'social.competitor.to_ideas',
    resourceType: 'social_idea',
    resourceId: reportId,
    metadata: { inserted, competitor: row.competitor },
  });

  revalidatePath('/social/ideas');
  return { ok: true, inserted };
}
