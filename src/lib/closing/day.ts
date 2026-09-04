import { parisDateOf, parisMidnightUTC } from './gamification/periods';
import type { Pool, PoolCandidate } from './pool';

/**
 * La journée d'un closer — composition pure de « Aujourd'hui ».
 *
 * L'écran ne demande rien au closer : il range ce qui est dû (en retard,
 * maintenant, plus tard aujourd'hui, à venir), ce qu'il a réservé dans le
 * pool, et propose l'ordre des appels du mode session. Tout est calculé ici,
 * sans base ni « maintenant » implicite, donc testable.
 */

/** Objectif d'appels par jour, affiché comme jauge. Réglage, pas dogme. */
export const DAILY_CALL_GOAL = 40;

/** Une session d'appels ne charge jamais plus de personnes que ça. */
export const SESSION_MAX = 60;

export type Dated = { dueAt: Date };

export type SplitTasks<T extends Dated> = {
  overdue: T[];
  dueToday: T[];
  laterToday: T[];
  upcoming: T[];
};

/** Minuit parisien du lendemain : la borne « fin de journée ». */
export function endOfParisDay(now: Date): Date {
  const d = parisDateOf(now);
  return parisMidnightUTC(d.year, d.month, d.day + 1);
}

/**
 * Coupe les actions en attente en quatre files disjointes. « Plus tard
 * aujourd'hui » = dû dans la journée mais pas encore ; « à venir » = après
 * minuit. Rien n'apparaît deux fois.
 */
export function splitTasks<T extends Dated>(tasks: T[], now: Date): SplitTasks<T> {
  const endOfDay = endOfParisDay(now).getTime();
  const nowMs = now.getTime();
  const out: SplitTasks<T> = { overdue: [], dueToday: [], laterToday: [], upcoming: [] };
  const sorted = [...tasks].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  for (const t of sorted) {
    const at = t.dueAt.getTime();
    if (at < nowMs) out.overdue.push(t);
    else if (at < nowMs + 60 * 60_000) out.dueToday.push(t);
    else if (at < endOfDay) out.laterToday.push(t);
    else out.upcoming.push(t);
  }
  return out;
}

export type SessionInput<T extends PoolCandidate & { id: string }> = {
  /** Personnes réservées par le closer (« Je prends » actif). */
  reserved: T[];
  /** Ses clients dont une action est due (en retard puis maintenant). */
  due: T[];
  /** Le pool commun, déjà rangé par niveau. */
  pool: Pool<T>;
  /** Sa base à travailler quand tout le reste est vide (clients sans action). */
  backlog?: T[];
};

/**
 * L'ordre du mode appel : ce que j'ai réservé, ce qui est dû, puis le pool
 * (pubs d'abord), puis ma base sans action. Une personne n'apparaît qu'une
 * fois, à sa première place.
 */
export function sessionOrder<T extends PoolCandidate & { id: string }>(
  input: SessionInput<T>,
  max: number = SESSION_MAX,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  const push = (rows: T[]) => {
    for (const r of rows) {
      if (out.length >= max) return;
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
  };
  push(input.reserved);
  push(input.due);
  push(input.pool.breach_new);
  push(input.pool.other_new);
  push(input.pool.hot);
  push(input.backlog ?? []);
  push(input.pool.base);
  return out;
}

/** Progression vers l'objectif du jour, bornée à 100. */
export function goalProgressPct(calls: number, goal: number = DAILY_CALL_GOAL): number {
  if (goal <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((calls / goal) * 100)));
}
