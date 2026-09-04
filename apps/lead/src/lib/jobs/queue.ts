import 'server-only';
import { and, eq, lte, sql } from 'drizzle-orm';
import { jobs } from '@/lib/db/schema';
import { asSystem, type Tx } from '@/lib/db/session';

/**
 * File de tâches en base (section 7 : « tout job est idempotent et rejouable »).
 *
 * - `enqueueJob(tx, …)` s'écrit dans LA MÊME transaction que l'action métier :
 *   pas de lead sans son alerte, pas d'alerte sans son lead.
 * - `runDueJobs()` est appelé par /api/cron/tick chaque minute (Render) et par
 *   `runJobsNow()` juste après la réponse d'un webhook (immédiat).
 * - Verrou `FOR UPDATE SKIP LOCKED` : deux ticks simultanés ne traitent jamais
 *   le même job. Un job planté est remis en file avec un délai croissant, puis
 *   marqué `failed` après `max_attempts`.
 */
export type JobPayload = Record<string, unknown>;

export type JobContext = { jobId: string; attempt: number; now: Date };
export type JobHandler = (payload: JobPayload, ctx: JobContext) => Promise<void>;

const registry = new Map<string, JobHandler>();

export function registerJob(kind: string, handler: JobHandler): void {
  registry.set(kind, handler);
}

export function registeredKinds(): string[] {
  return [...registry.keys()];
}

export type EnqueueInput = {
  kind: string;
  payload?: JobPayload;
  runAt?: Date;
  /** Empêche un doublon : même clé = même job, la seconde insertion est ignorée. */
  idempotencyKey?: string;
  maxAttempts?: number;
};

/** Renvoie l'id du job créé, ou `null` si la clé d'idempotence existait déjà. */
export async function enqueueJob(tx: Tx, input: EnqueueInput): Promise<string | null> {
  const rows = await tx
    .insert(jobs)
    .values({
      kind: input.kind,
      payload: input.payload ?? {},
      runAt: input.runAt ?? new Date(),
      idempotencyKey: input.idempotencyKey ?? null,
      maxAttempts: input.maxAttempts ?? 3,
    })
    .onConflictDoNothing({ target: jobs.idempotencyKey })
    .returning({ id: jobs.id });
  return rows[0]?.id ?? null;
}

/** Annule les jobs en attente portant cette clé (ex. escalade SLA devenue inutile). */
export async function cancelJobsByKey(tx: Tx, idempotencyKey: string): Promise<void> {
  await tx
    .update(jobs)
    .set({ status: 'cancelled' })
    .where(and(eq(jobs.idempotencyKey, idempotencyKey), eq(jobs.status, 'pending')));
}

/** Un job « running » depuis plus longtemps que ça est considéré planté et remis en file. */
const STALE_RUNNING_MINUTES = 10;

function backoffMs(attempt: number): number {
  return Math.min(60 * 60 * 1000, attempt * attempt * 60 * 1000);
}

type ClaimedJob = { id: string; kind: string; payload: JobPayload; attempts: number };

async function claimJobs(limit: number, now: Date, onlyIds?: string[]): Promise<ClaimedJob[]> {
  return asSystem(async (tx) => {
    // Remise en file des jobs plantés (process tué en plein vol).
    await tx.execute(sql`
      update lead.jobs set status = 'pending', locked_at = null
      where status = 'running' and locked_at < ${new Date(now.getTime() - STALE_RUNNING_MINUTES * 60000)}
    `);
    const idFilter = onlyIds?.length ? sql`and id = any(${onlyIds}::uuid[])` : sql``;
    const rows = await tx.execute(sql`
      with due as (
        select id from lead.jobs
        where status = 'pending' and run_at <= ${now} ${idFilter}
        order by run_at asc
        limit ${limit}
        for update skip locked
      )
      update lead.jobs j
      set status = 'running', locked_at = ${now}, attempts = j.attempts + 1
      from due
      where j.id = due.id
      returning j.id, j.kind, j.payload, j.attempts
    `);
    return (rows as unknown as ClaimedJob[]).map((r) => ({
      id: String(r.id),
      kind: String(r.kind),
      payload: (r.payload ?? {}) as JobPayload,
      attempts: Number(r.attempts),
    }));
  });
}

export type RunResult = {
  processed: number;
  succeeded: number;
  retried: number;
  failed: number;
  errors: string[];
};

async function executeClaimed(claimed: ClaimedJob[], now: Date): Promise<RunResult> {
  const result: RunResult = { processed: 0, succeeded: 0, retried: 0, failed: 0, errors: [] };
  for (const job of claimed) {
    result.processed++;
    const handler = registry.get(job.kind);
    try {
      if (!handler) throw new Error(`Aucun handler pour le job « ${job.kind} »`);
      await handler(job.payload, { jobId: job.id, attempt: job.attempts, now });
      await asSystem((tx) =>
        tx
          .update(jobs)
          .set({ status: 'done', doneAt: new Date(), lockedAt: null })
          .where(eq(jobs.id, job.id)),
      );
      result.succeeded++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result.errors.push(`${job.kind}#${job.id.slice(0, 8)} : ${message}`);
      const row = await asSystem((tx) =>
        tx.select({ max: jobs.maxAttempts }).from(jobs).where(eq(jobs.id, job.id)).limit(1),
      );
      const max = row[0]?.max ?? 3;
      if (job.attempts >= max) {
        await asSystem((tx) =>
          tx
            .update(jobs)
            .set({ status: 'failed', lastError: message, lockedAt: null })
            .where(eq(jobs.id, job.id)),
        );
        result.failed++;
      } else {
        await asSystem((tx) =>
          tx
            .update(jobs)
            .set({
              status: 'pending',
              lastError: message,
              lockedAt: null,
              runAt: new Date(now.getTime() + backoffMs(job.attempts)),
            })
            .where(eq(jobs.id, job.id)),
        );
        result.retried++;
      }
    }
  }
  return result;
}

/** Tick : traite les jobs échus, par lots. */
export async function runDueJobs(options: { limit?: number; now?: Date } = {}): Promise<RunResult> {
  const now = options.now ?? new Date();
  const claimed = await claimJobs(options.limit ?? 50, now);
  return executeClaimed(claimed, now);
}

/** Immédiat : traite tout de suite des jobs précis (après la réponse d'un webhook). */
export async function runJobsNow(ids: string[]): Promise<RunResult> {
  const valid = ids.filter(Boolean);
  if (!valid.length) return { processed: 0, succeeded: 0, retried: 0, failed: 0, errors: [] };
  const now = new Date();
  const claimed = await claimJobs(valid.length, now, valid);
  return executeClaimed(claimed, now);
}

/** Nombre de jobs en attente échus (observabilité). */
export async function countOverdueJobs(now = new Date()): Promise<number> {
  const rows = await asSystem((tx) =>
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.status, 'pending'), lte(jobs.runAt, now))),
  );
  return rows[0]?.n ?? 0;
}
