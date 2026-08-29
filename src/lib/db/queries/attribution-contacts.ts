import 'server-only';
import { sql } from 'drizzle-orm';
import type { Contact } from '@/lib/closing/attribution';
import { db } from '@/lib/db';

/**
 * Contacts « email » pour le moteur d'attribution (last-touch).
 *
 * Les ouvertures/clics d'emails n'ont JAMAIS vécu dans `interactions` : ils
 * arrivent par le webhook Brevo dans `email_events`, rattachés par adresse.
 * Or l'attribution lisait uniquement `interactions.type in ('email_opened',
 * 'email_clicked')` — deux valeurs d'enum que rien n'écrit. Le repli
 * last-touch documenté (docs priorisation, partie II) était donc lettre
 * morte : ce module le branche sur la vraie source.
 *
 * Les appels priment toujours dans la fenêtre : ces contacts ne retirent
 * jamais une souscription à un closer, ils rendent seulement honnête le
 * « via » des conversions sans appel.
 */

/** Événements Brevo qui valent ouverture / clic (noms bruts du webhook). */
const OPEN_EVENTS = ['opened', 'unique_opened', 'uniqueOpened', 'proxy_open', 'loadedByProxy'];
const CLICK_EVENTS = ['click', 'clicks'];

type Row = { investor_id: string; kind: 'open' | 'click'; at: string | Date };

/**
 * Ajoute aux contacts existants (par investisseur) les ouvertures/clics email,
 * rattachés par adresse (insensible à la casse). Mutation du Map fourni —
 * même convention que la construction des contacts d'appel.
 */
export async function appendEmailContacts(
  contactsByInvestor: Map<string, Contact[]>,
  investorIds?: string[],
): Promise<void> {
  if (investorIds && investorIds.length === 0) return;
  const rows = (await db.execute(sql`
    select i.id::text as investor_id,
           case when ee.event in (${sql.join(
             CLICK_EVENTS.map((e) => sql`${e}`),
             sql`, `,
           )}) then 'click' else 'open' end as kind,
           coalesce(ee.occurred_at, ee.created_at) as at
    from email_events ee
    join investors i on lower(i.email) = lower(ee.email)
    where ee.event in (${sql.join(
      [...OPEN_EVENTS, ...CLICK_EVENTS].map((e) => sql`${e}`),
      sql`, `,
    )})
      and i.deleted_at is null
      ${
        investorIds
          ? sql`and i.id in (${sql.join(
              investorIds.map((id) => sql`${id}`),
              sql`, `,
            )})`
          : sql``
      }
  `)) as unknown as Row[];

  for (const r of rows) {
    const list = contactsByInvestor.get(r.investor_id) ?? [];
    // userId null : un email n'est pas l'appel d'un closer — le last-touch
    // email rend la conversion « attribuée via email », pas créditée.
    list.push({ kind: r.kind, at: new Date(r.at), userId: null });
    contactsByInvestor.set(r.investor_id, list);
  }
}
