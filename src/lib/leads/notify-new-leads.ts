import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { syncRecentInvestors } from '@/lib/integrations/sah/sync';
import {
  buildAlertMessage,
  MAX_LEAD_AGE_MINUTES,
  type NewLead,
  shouldAlert,
} from '@/lib/leads/new-lead-alert';
import { isTelegramConfigured, sendTelegram } from '@/lib/notifications/telegram';
import { notifyChange } from '@/lib/realtime/broadcast';
import { SYNC_TOPICS } from '@/lib/realtime/topics';

/**
 * Détecte les nouveaux inscrits BREACH et prévient les closers.
 *
 * Enchaînement, toutes les 2 minutes :
 *   1. synchro CIBLÉE des inscriptions récentes (la fiche doit exister avant
 *      que le closer ne clique sur le lien de la notification) ;
 *   2. sélection des leads BREACH jamais alertés ;
 *   3. envoi Telegram à chaque closer qui a configuré son identifiant ;
 *   4. marquage — une inscription ne déclenche qu'UNE alerte, jamais deux.
 *
 * Le marquage a lieu même quand aucun closer n'est joignable : sinon, le jour
 * où quelqu'un configure Telegram, il recevrait d'un coup toutes les alertes
 * en retard.
 */

/**
 * Fenêtre de rattrapage de la synchro ciblée.
 *
 * Plus large que l'intervalle du cron (2 min) : si une exécution échoue ou
 * traîne, la suivante rattrape au lieu de laisser un lead invisible jusqu'à la
 * synchro complète du quart d'heure.
 */
const LOOKBACK_MINUTES = 20;

/** Même définition de BREACH que la file d'appels et le suivi. */
const BREACH_PREDICATE = sql`(i.breach_level is not null or i.bonus_code ilike '%breach%')`;

export type NotifyResult = {
  /** Comptes remontés de SAH par la synchro ciblée. */
  synced: number;
  /** Leads BREACH éligibles trouvés. */
  found: number;
  /** Leads pour lesquels au moins une notification est partie. */
  alerted: number;
  /** Closers joignables (identifiant Telegram renseigné). */
  recipients: number;
  /** Ce qui a été écarté, et pourquoi — jamais silencieux. */
  skipped: string[];
  errors: string[];
};

export async function notifyNewLeads(now = new Date()): Promise<NotifyResult> {
  const result: NotifyResult = {
    synced: 0,
    found: 0,
    alerted: 0,
    recipients: 0,
    skipped: [],
    errors: [],
  };

  // 1. La fiche doit exister avant la notification.
  try {
    result.synced = await syncRecentInvestors(LOOKBACK_MINUTES);
  } catch (e) {
    // On continue quand même : un lead arrivé à la synchro précédente et pas
    // encore alerté doit pouvoir l'être malgré une panne côté SAH.
    result.errors.push(`synchro ciblée : ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. Les leads BREACH jamais alertés, assez récents pour que l'urgence tienne.
  const rows = await db.execute(sql`
    select i.id::text as investor_id, i.sah_id, i.full_name, i.email, i.phone,
           i.bonus_code, i.address_city, i.sah_created_at
    from investors i
    where i.deleted_at is null
      and i.new_lead_alerted_at is null
      and i.sah_created_at is not null
      and i.sah_created_at > now() - (${MAX_LEAD_AGE_MINUTES} * interval '1 minute')
      and ${BREACH_PREDICATE}
      -- Un RDV Calendly pris : Guillaume s'en occupe, pas d'alerte aux closers.
      and not exists (
        select 1 from rdv_contacts rc
        where rc.source = 'calendly'
          and (rc.investor_id = i.id or lower(rc.calendly_email) = lower(i.email))
      )
    order by i.sah_created_at asc
  `);

  const leads: NewLead[] = (rows as unknown as Record<string, unknown>[]).map((r) => ({
    investorId: String(r.investor_id),
    sahId: String(r.sah_id),
    fullName: r.full_name ? String(r.full_name) : null,
    email: String(r.email),
    phone: r.phone ? String(r.phone) : null,
    bonusCode: r.bonus_code ? String(r.bonus_code) : null,
    city: r.address_city ? String(r.address_city) : null,
    createdAt: new Date(String(r.sah_created_at)),
  }));
  result.found = leads.length;
  if (leads.length === 0) return result;

  // 3. Qui prévenir : les closers et admins qui ont configuré Telegram.
  const userRows = await db.execute(sql`
    select id::text as id, full_name, telegram_chat_id
    from users
    where active and telegram_chat_id is not null and telegram_chat_id <> ''
      and role in ('admin', 'closer', 'closer_junior')
  `);
  const recipients = (userRows as unknown as Record<string, unknown>[]).map((u) => ({
    name: u.full_name ? String(u.full_name) : 'closer',
    chatId: String(u.telegram_chat_id),
  }));
  result.recipients = recipients.length;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const configured = isTelegramConfigured();

  for (const lead of leads) {
    const decision = shouldAlert(lead, now);
    if (!decision.send) {
      // Heure calme : on ne marque PAS, l'alerte partira à l'ouverture. Les
      // autres refus sont définitifs : on marque pour ne pas les réexaminer
      // toutes les deux minutes jusqu'à la fin des temps.
      const definitif = !decision.reason.startsWith('heure calme');
      if (definitif) await markAlerted(lead.investorId);
      result.skipped.push(`${lead.email} : ${decision.reason}`);
      continue;
    }

    if (!configured || recipients.length === 0) {
      // Personne à prévenir : on marque quand même, sinon le premier closer à
      // configurer Telegram recevrait des dizaines d'alertes périmées d'un coup.
      await markAlerted(lead.investorId);
      result.skipped.push(
        `${lead.email} : ${configured ? 'aucun closer joignable' : 'bot Telegram non configuré'}`,
      );
      continue;
    }

    const message = buildAlertMessage(lead, now, appUrl);
    let delivered = 0;
    for (const r of recipients) {
      const sent = await sendTelegram(r.chatId, message);
      if (sent.ok) delivered++;
      else result.errors.push(`${r.name} : ${sent.error}`);
    }

    // Marqué dès qu'au moins un closer a reçu l'alerte. Si PERSONNE ne l'a
    // reçue, on ne marque pas : la tentative sera refaite dans deux minutes.
    if (delivered > 0) {
      await markAlerted(lead.investorId);
      result.alerted++;
    }
  }

  if (result.alerted > 0 || result.synced > 0) {
    // Les nouveaux leads apparaissent dans la file d'appels des écrans ouverts.
    await notifyChange(SYNC_TOPICS.closing);
  }
  return result;
}

/** Write-once : l'inscription ne déclenchera plus jamais d'alerte. */
async function markAlerted(investorId: string): Promise<void> {
  await db.execute(sql`
    update investors set new_lead_alerted_at = now()
    where id = ${investorId} and new_lead_alerted_at is null
  `);
}
