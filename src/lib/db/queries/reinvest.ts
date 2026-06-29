import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { isBreachCode } from './call-queue';

/**
 * Candidats au réinvestissement : investisseurs dont le capital revient bientôt.
 *
 * Règle d'échéance (décision Killian) : **clôture de collecte + 1 an**
 * (`projects.expected_completion_at` = SAH `closing_date`), plus fiable que la
 * `repayment_date` SAH. On rappelle ~1-2 semaines avant pour réinvestir.
 *
 * Priorisation : par **capital investi décroissant** (gros tickets d'abord).
 * Filtre : on **n'appelle pas** les tickets < 1 000 € (bruit).
 */

const MIN_INVEST_EUR = 1000;
const REPAYMENT_LAG = "interval '1 year'";

export type ReinvestRow = {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  isBreach: boolean;
  totalInvested: number;
  /** Échéance estimée la plus proche = clôture collecte + 1 an (à venir). */
  nextRepayment: Date;
  daysUntil: number;
};

type RawRow = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  bonus_code: string | null;
  breach_level: number | null;
  total_invested: string | number | null;
  next_repayment: string | Date | null;
};

const DAY_MS = 86_400_000;

export async function getReinvestCandidates(horizonDays = 60): Promise<ReinvestRow[]> {
  const result = await db.execute(sql`
    select
      i.id::text as id,
      i.full_name,
      i.email,
      i.phone,
      i.address_city as city,
      i.bonus_code,
      i.breach_level,
      coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0) as total_invested,
      min(
        case
          when s.status <> 'cancelled'
            and p.expected_completion_at is not null
            and p.expected_completion_at + ${sql.raw(REPAYMENT_LAG)} > now()
          then p.expected_completion_at + ${sql.raw(REPAYMENT_LAG)}
        end
      ) as next_repayment
    from investors i
    join subscriptions s on s.investor_id = i.id
    join projects p on p.id = s.project_id
    where i.deleted_at is null
    group by i.id
    having coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0) >= ${MIN_INVEST_EUR}
  `);

  const rows = result as unknown as RawRow[];
  const now = Date.now();
  const out: ReinvestRow[] = [];

  for (const r of rows) {
    if (!r.next_repayment) continue;
    const date = new Date(r.next_repayment);
    const days = Math.ceil((date.getTime() - now) / DAY_MS);
    if (days < 0 || days > horizonDays) continue;
    out.push({
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      phone: r.phone,
      city: r.city,
      isBreach: r.breach_level != null || isBreachCode(r.bonus_code),
      totalInvested: Number(r.total_invested) || 0,
      nextRepayment: date,
      daysUntil: days,
    });
  }

  // Priorité capital : gros tickets d'abord ; à capital égal, échéance la plus proche.
  out.sort((a, b) => b.totalInvested - a.totalInvested || a.daysUntil - b.daysUntil);
  return out;
}
