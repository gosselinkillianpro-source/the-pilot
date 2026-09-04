import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Fiches contact des rendez-vous Calendly.
 *
 * Les RDV vivent chez Calendly, lus à la volée par l'API. Mais un rendez-vous
 * honoré n'est que le début : il faut ensuite pouvoir noter, rappeler, suivre.
 * Cette table donne une fiche stable à chaque personne rencontrée — la même
 * mécanique que pour les inscrits webinaire, qui l'utilisent depuis leur côté.
 *
 * ⚠️ Sans ces fiches, le tableau de suivi des RDV serait vide : au 28/08/2026,
 * `rdv_contacts` ne contenait que des inscrits webinaire (222) et zéro lead
 * Calendly, alors que les rendez-vous, eux, existaient bien.
 */

export type RdvLeadInput = {
  email: string;
  fullName: string | null;
  /** Téléphone connu de Calendly — ne remplace jamais un numéro déjà saisi. */
  phone?: string | null;
  /** Statut Calendly du rendez-vous le plus récent de cette personne. */
  statut: 'a_venir' | 'honore' | 'no_show' | 'reporte' | 'annule';
  investorId: string | null;
};

/**
 * Crée (ou met à jour) une fiche par lead de RDV, et pose son étape de départ.
 *
 * Étape initiale déduite du rendez-vous, jamais en arrière :
 *   · RDV à venir ou reporté → « Pris en charge » (quelqu'un s'en occupe déjà)
 *   · RDV honoré            → « Appelé » (l'échange a eu lieu)
 *   · no-show / annulé      → « Pris en charge » : la personne reste à
 *     retravailler ; ce n'est pas une perte, c'est un rendez-vous manqué.
 *
 * @returns nombre de fiches créées.
 */
/**
 * Fiche contact Calendly correspondant à chaque e-mail (insensible à la casse).
 * Sert à rendre CLIQUABLE un lead de l'agenda même hors base SAH : la page RDV
 * relie chaque rendez-vous à sa fiche prospect via cette map.
 */
export async function getContactIdsByEmails(emails: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(emails.filter(Boolean).map((e) => e.trim().toLowerCase()))];
  const map = new Map<string, string>();
  if (wanted.length === 0) return map;
  const rows = await db.execute(sql`
    select id::text as id, lower(calendly_email) as email
    from rdv_contacts
    where source = 'calendly' and lower(calendly_email) = any(${wanted})
  `);
  for (const r of rows as unknown as { id: string; email: string }[]) {
    map.set(r.email, r.id);
  }
  return map;
}

export async function upsertRdvContacts(
  leads: RdvLeadInput[],
  ownerUserId: string,
): Promise<number> {
  const withEmail = leads.filter((l) => l.email.trim() !== '');
  if (withEmail.length === 0) return 0;

  let created = 0;
  for (const lead of withEmail) {
    const email = lead.email.trim().toLowerCase();
    const stage = lead.statut === 'honore' ? 'called' : 'taken';

    // Une fiche par e-mail et par source : deux rendez-vous de la même personne
    // ne doivent pas produire deux cartes dans le tableau de suivi.
    //
    // ⚠️ L'index unique en base (rdv_contacts_owner_email_key, migration 0016)
    // porte sur (lower(calendly_email), owner_user_id) SANS la colonne source
    // (ajoutée après, en 0018). Une fiche webinar du même e-mail chez le même
    // closer passe donc le guard ci-dessous mais violerait l'index — et deux
    // rendus concurrents de /rdv peuvent doubler l'insert. Dans les deux cas :
    // on ne crée rien plutôt que de faire tomber toute la page.
    const rows = await db.execute(sql`
      insert into rdv_contacts (
        calendly_email, full_name, phone, source, owner_user_id, investor_id,
        pipeline_stage, pipeline_entered_at, pipeline_stage_updated_at
      )
      select ${email}, ${lead.fullName}, ${lead.phone ?? null}, 'calendly', ${ownerUserId}, ${lead.investorId},
             ${stage}::contact_stage, now(), now()
      where not exists (
        select 1 from rdv_contacts c
        where lower(c.calendly_email) = ${email} and c.source = 'calendly'
      )
      on conflict (lower(calendly_email), owner_user_id) do nothing
      returning id
    `);
    if ((rows as unknown as unknown[]).length > 0) {
      created++;
      continue;
    }

    // Fiche existante : on complète ce qui manque et on fait avancer l'étape,
    // sans jamais écraser un classement fait à la main par un closer.
    await db.execute(sql`
      update rdv_contacts c
      set full_name = coalesce(nullif(trim(c.full_name), ''), ${lead.fullName}),
          phone = coalesce(nullif(trim(c.phone), ''), ${lead.phone ?? null}),
          investor_id = coalesce(c.investor_id, ${lead.investorId}),
          owner_user_id = coalesce(c.owner_user_id, ${ownerUserId}),
          pipeline_stage = case
            when c.pipeline_stage is null then ${stage}::contact_stage
            when c.pipeline_stage = 'taken' and ${stage} = 'called' then 'called'::contact_stage
            else c.pipeline_stage
          end,
          pipeline_entered_at = coalesce(c.pipeline_entered_at, now()),
          pipeline_stage_updated_at = case
            when c.pipeline_stage is null
              or (c.pipeline_stage = 'taken' and ${stage} = 'called')
            then now() else c.pipeline_stage_updated_at
          end,
          updated_at = now()
      where lower(c.calendly_email) = ${email} and c.source = 'calendly'
    `);
  }
  return created;
}
