import 'server-only';
import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { type AuthenticatedUser, scopeFor } from '@/lib/auth';
import { appointments, campaigns, leads } from '@/lib/db/schema';
import { withDbSession } from '@/lib/db/session';
import { addDays } from '@/lib/domain/time';

export type WeeklyRow = {
  campaignId: string | null;
  campaignName: string;
  leads: number;
  rdvPoses: number;
  honores: number;
  conformes: number;
  signes: number;
  delaiMoyenMin: number | null;
};

/** Aperçu vivant du tableau du lundi pour une semaine (la version matérialisée arrive avec le module H). */
export async function weeklySnapshot(
  user: AuthenticatedUser,
  weekMonday: Date,
): Promise<WeeklyRow[]> {
  const weekEnd = addDays(weekMonday, 7);
  return withDbSession(scopeFor(user), async (tx) => {
    const rows = await tx
      .select({
        campaignId: leads.campaignId,
        campaignName: sql<string>`coalesce(${campaigns.name}, '(sans campagne)')`,
        leads: sql<number>`count(distinct ${leads.id})::int`,
        rdvPoses: sql<number>`count(distinct ${appointments.id})::int`,
        honores: sql<number>`count(distinct case when ${appointments.status} in ('honore') or ${appointments.conformity} is not null then ${appointments.id} end)::int`,
        conformes: sql<number>`count(distinct case when ${appointments.conformity} = 'conforme' then ${appointments.id} end)::int`,
        signes: sql<number>`count(distinct case when ${appointments.outcome} = 'signe' then ${appointments.id} end)::int`,
        delaiMoyenMin: sql<number | null>`round(avg(${leads.slaMinutesEffective}))::int`,
      })
      .from(leads)
      .leftJoin(campaigns, eq(campaigns.id, leads.campaignId))
      .leftJoin(
        appointments,
        and(eq(appointments.leadId, leads.id), isNull(appointments.replacementOf)),
      )
      .where(
        and(
          isNull(leads.deletedAt),
          gte(leads.receivedAt, weekMonday),
          lt(leads.receivedAt, weekEnd),
        ),
      )
      .groupBy(leads.campaignId, campaigns.name)
      .orderBy(sql`count(distinct ${leads.id}) desc`);
    return rows.map((r) => ({
      campaignId: r.campaignId,
      campaignName: r.campaignName,
      leads: Number(r.leads),
      rdvPoses: Number(r.rdvPoses),
      honores: Number(r.honores),
      conformes: Number(r.conformes),
      signes: Number(r.signes),
      delaiMoyenMin: r.delaiMoyenMin === null ? null : Number(r.delaiMoyenMin),
    }));
  });
}
