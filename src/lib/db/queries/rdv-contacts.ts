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
  // Une fiche par e-mail : deux rendez-vous de la même personne ne doivent pas
  // produire deux cartes. Si l'un des deux est honoré, c'est lui qui compte.
  const byEmail = new Map<string, RdvLeadInput & { stage: 'taken' | 'called' }>();
  for (const lead of leads) {
    const email = lead.email.trim().toLowerCase();
    if (!email) continue;
    const stage = lead.statut === 'honore' ? 'called' : 'taken';
    const prev = byEmail.get(email);
    if (!prev || (prev.stage === 'taken' && stage === 'called')) {
      byEmail.set(email, {
        ...lead,
        email,
        fullName: lead.fullName ?? prev?.fullName ?? null,
        phone: lead.phone ?? prev?.phone ?? null,
        investorId: lead.investorId ?? prev?.investorId ?? null,
        stage,
      });
    }
  }
  const batch = [...byEmail.values()];
  if (batch.length === 0) return 0;

  // DEUX requêtes pour tout le lot (au lieu de deux PAR lead) : l'agenda de
  // Guillaume, c'est 40 rendez-vous = 80 allers-retours base économisés à
  // chaque affichage de la page RDV. Les lignes arrivent via unnest().
  const emails = batch.map((l) => l.email);
  const names = batch.map((l) => l.fullName);
  const phones = batch.map((l) => l.phone ?? null);
  const stages = batch.map((l) => l.stage);
  const investorIds = batch.map((l) => l.investorId);

  // ⚠️ L'index unique en base (rdv_contacts_owner_email_key, migration 0016)
  // porte sur (lower(calendly_email), owner_user_id) SANS la colonne source
  // (ajoutée après, en 0018). Une fiche webinar du même e-mail chez le même
  // closer passe le guard `not exists` mais violerait l'index — d'où le
  // `on conflict do nothing` : on ne crée rien plutôt que de faire tomber la page.
  const inserted = await db.execute(sql`
    insert into rdv_contacts (
      calendly_email, full_name, phone, source, owner_user_id, investor_id,
      pipeline_stage, pipeline_entered_at, pipeline_stage_updated_at
    )
    select i.email, i.full_name, i.phone, 'calendly', ${ownerUserId}, i.investor_id,
           i.stage::contact_stage, now(), now()
    from unnest(
      ${emails}::text[], ${names}::text[], ${phones}::text[],
      ${stages}::text[], ${investorIds}::uuid[]
    ) as i(email, full_name, phone, stage, investor_id)
    where not exists (
      select 1 from rdv_contacts c
      where lower(c.calendly_email) = i.email and c.source = 'calendly'
    )
    on conflict (lower(calendly_email), owner_user_id) do nothing
    returning id
  `);
  const created = (inserted as unknown as unknown[]).length;

  // Fiches existantes : on complète ce qui manque et on fait avancer l'étape,
  // sans jamais écraser un classement fait à la main par un closer. (Les
  // fiches tout juste créées repassent ici sans effet : mêmes valeurs.)
  await db.execute(sql`
    update rdv_contacts c
    set full_name = coalesce(nullif(trim(c.full_name), ''), i.full_name),
        phone = coalesce(nullif(trim(c.phone), ''), i.phone),
        investor_id = coalesce(c.investor_id, i.investor_id),
        owner_user_id = coalesce(c.owner_user_id, ${ownerUserId}),
        pipeline_stage = case
          when c.pipeline_stage is null then i.stage::contact_stage
          when c.pipeline_stage = 'taken' and i.stage = 'called' then 'called'::contact_stage
          else c.pipeline_stage
        end,
        pipeline_entered_at = coalesce(c.pipeline_entered_at, now()),
        pipeline_stage_updated_at = case
          when c.pipeline_stage is null
            or (c.pipeline_stage = 'taken' and i.stage = 'called')
          then now() else c.pipeline_stage_updated_at
        end,
        updated_at = now()
    from unnest(
      ${emails}::text[], ${names}::text[], ${phones}::text[],
      ${stages}::text[], ${investorIds}::uuid[]
    ) as i(email, full_name, phone, stage, investor_id)
    where lower(c.calendly_email) = i.email and c.source = 'calendly'
  `);

  return created;
}
