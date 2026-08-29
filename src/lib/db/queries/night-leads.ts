import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { isNightSignup, NIGHT_LEAD_MAX_AGE_HOURS } from '@/lib/leads/night-leads';

/**
 * Les inscrits BREACH de la nuit jamais appelés — la liste « premier réflexe
 * du matin » affichée en haut de la file d'appels.
 *
 * Même périmètre que l'alerte Telegram des 5 minutes : les leads BREACH avec
 * un téléphone. Un lead disparaît de cette liste dès le premier appel
 * enregistré (peu importe le closer) ou passé le délai de rattrapage.
 */

export type NightLead = {
  id: string;
  fullName: string | null;
  email: string;
  phone: string;
  city: string | null;
  sahCreatedAt: Date;
  claimedById: string | null;
  claimerName: string | null;
};

type Row = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string;
  address_city: string | null;
  sah_created_at: string | Date;
  claimed_by_id: string | null;
  claimer_name: string | null;
};

export async function getNightLeadsToCall(now: Date = new Date()): Promise<NightLead[]> {
  const since = new Date(now.getTime() - NIGHT_LEAD_MAX_AGE_HOURS * 3_600_000);
  const rows = (await db.execute(sql`
    select i.id::text as id, i.full_name, i.email, i.phone, i.address_city,
           i.sah_created_at, i.claimed_by_id::text as claimed_by_id, u.full_name as claimer_name
    from investors i
    left join users u on u.id = i.claimed_by_id
    where i.deleted_at is null
      and (i.breach_level is not null or i.bonus_code ilike '%breach%')
      and i.phone is not null
      and i.sah_created_at >= ${since.toISOString()}::timestamptz
      and not exists (
        select 1 from interactions ix
        where ix.investor_id = i.id
          and ix.type in ('call_outbound', 'call_inbound')
          and ix.created_at >= i.sah_created_at
      )
    order by i.sah_created_at asc
  `)) as unknown as Row[];

  return rows
    .map((r) => ({
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      phone: r.phone,
      city: r.address_city,
      sahCreatedAt: new Date(r.sah_created_at),
      claimedById: r.claimed_by_id,
      claimerName: r.claimer_name,
    }))
    .filter((r) => isNightSignup(r.sahCreatedAt));
}
