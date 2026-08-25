import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rdvContacts, webinarRegistrations, webinars } from '@/lib/db/schema';
import {
  listBroadcasts,
  listSubscriptions,
  type WgSubscription,
} from '@/lib/integrations/webinargeek/client';

/**
 * Synchronisation WebinarGeek → THE PILOT.
 *
 * Remplace l'export CSV manuel des « abonnés ». Pour chaque inscrit :
 *   1. on enregistre l'inscription et TOUT son engagement ;
 *   2. on lui crée une FICHE CONTACT locale, parce qu'un inscrit n'a pas
 *      forcément de compte SAH — sans elle, impossible de lui poser une note
 *      ou un rappel ;
 *   3. on tente de le rattacher à une fiche investisseur SAH par e-mail.
 *
 * Le rattachement est rejoué à chaque synchro : quelqu'un qui s'inscrit sur SAH
 * trois semaines après le webinaire est relié automatiquement, sans intervention.
 */

export type WebinarSyncResult = {
  webinars: number;
  registrations: number;
  contactsCreated: number;
  investorsLinked: number;
  errors: string[];
};

/** Nom d'affichage à partir des champs WebinarGeek. */
function fullName(sub: WgSubscription): string | null {
  const parts = [sub.firstName, sub.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Relie les fiches contact aux investisseurs SAH par e-mail.
 *
 * Appelée après chaque synchro webinaire, et destinée à l'être aussi après la
 * synchro SAH : c'est ce qui fait qu'un inscrit au webinaire qui crée son
 * compte SAH plus tard se retrouve relié tout seul.
 *
 * Ne touche QUE les fiches non encore reliées — on n'écrase jamais un
 * rattachement fait à la main par un closer.
 */
export async function linkContactsToInvestors(): Promise<number> {
  const linked = await db.execute(sql`
    update rdv_contacts c
    set investor_id = i.id,
        linked_at = now(),
        updated_at = now()
    from investors i
    where c.investor_id is null
      and i.deleted_at is null
      and lower(i.email) = lower(c.calendly_email)
    returning c.id
  `);
  const rows = linked as unknown as { id: string }[];

  // Les inscriptions webinaire suivent le rattachement de leur fiche contact.
  await db.execute(sql`
    update webinar_registrations r
    set investor_id = c.investor_id
    from rdv_contacts c
    where r.rdv_contact_id = c.id
      and c.investor_id is not null
      and r.investor_id is distinct from c.investor_id
  `);

  return rows.length;
}

/** Crée (ou retrouve) la fiche contact d'un inscrit. */
async function upsertContact(sub: WgSubscription): Promise<{ id: string; created: boolean }> {
  const existing = await db
    .select({ id: rdvContacts.id })
    .from(rdvContacts)
    .where(eq(sql`lower(${rdvContacts.email})`, sub.email))
    .limit(1);

  if (existing[0]) {
    // La fiche existe déjà (autre webinaire, ou RDV Calendly) : on complète
    // les champs vides sans jamais écraser ce qu'un closer a pu saisir.
    await db
      .update(rdvContacts)
      .set({
        fullName: sql`coalesce(${rdvContacts.fullName}, ${fullName(sub)})`,
        phone: sql`coalesce(${rdvContacts.phone}, ${sub.phone})`,
        updatedAt: new Date(),
      })
      .where(eq(rdvContacts.id, existing[0].id));
    return { id: existing[0].id, created: false };
  }

  const inserted = await db
    .insert(rdvContacts)
    .values({
      email: sub.email,
      fullName: fullName(sub),
      phone: sub.phone,
      source: 'webinar',
      // Personne n'en est propriétaire tant qu'un closer ne l'a pas pris.
      ownerUserId: null,
    })
    .returning({ id: rdvContacts.id });

  const id = inserted[0]?.id;
  if (!id) throw new Error(`Création de fiche contact impossible pour ${sub.email}`);
  return { id, created: true };
}

/** Synchronise une diffusion et tous ses inscrits. */
async function syncBroadcast(
  broadcastId: string,
  title: string,
  startsAt: Date | null,
  durationMinutes: number | null,
  result: WebinarSyncResult,
): Promise<void> {
  const row = {
    wgBroadcastId: broadcastId,
    title,
    scheduledAt: startsAt,
    durationMinutes,
    syncedAt: new Date(),
    updatedAt: new Date(),
  };

  const upserted = await db
    .insert(webinars)
    .values(row)
    .onConflictDoUpdate({ target: webinars.wgBroadcastId, set: row })
    .returning({ id: webinars.id });

  const webinarId = upserted[0]?.id;
  if (!webinarId) throw new Error(`Webinaire ${broadcastId} non enregistré`);
  result.webinars += 1;

  const subs = await listSubscriptions(broadcastId);

  for (const sub of subs) {
    try {
      const contact = await upsertContact(sub);
      if (contact.created) result.contactsCreated += 1;

      const regRow = {
        webinarId,
        wgSubscriptionId: sub.id,
        email: sub.email,
        firstName: sub.firstName,
        lastName: sub.lastName,
        phone: sub.phone,
        company: sub.company,
        jobTitle: sub.jobTitle,
        watched: sub.watched,
        watchedLive: sub.watchedLive,
        watchedReplay: sub.watchedReplay,
        watchDurationS: sub.watchDurationS,
        watchDurationReplayS: sub.watchDurationReplayS,
        watchStart: sub.watchStart,
        watchEnd: sub.watchEnd,
        extraFields: sub.extraFields,
        consentFields: sub.consentFields,
        pollVotes: sub.pollVotes,
        quizAnswers: sub.quizAnswers,
        evaluationAnswers: sub.evaluationAnswers,
        callsToAction: sub.callsToAction,
        questions: sub.questions,
        rdvContactId: contact.id,
        unsubscribed: sub.unsubscribed,
        registeredAt: sub.registeredAt,
        syncedAt: new Date(),
      };

      await db
        .insert(webinarRegistrations)
        .values(regRow)
        .onConflictDoUpdate({
          target: [webinarRegistrations.webinarId, webinarRegistrations.wgSubscriptionId],
          set: regRow,
        });

      result.registrations += 1;
    } catch (e) {
      // Un inscrit illisible ne doit jamais interrompre la synchro des autres.
      result.errors.push(`${sub.email} : ${e instanceof Error ? e.message : 'erreur'}`);
    }
  }
}

/**
 * Synchronise les diffusions récentes.
 *
 * On saute les diffusions annulées et celles sans aucun inscrit : elles n'ont
 * rien à apporter et encombreraient la liste des closers.
 */
export async function syncWebinars(limit = 20): Promise<WebinarSyncResult> {
  const result: WebinarSyncResult = {
    webinars: 0,
    registrations: 0,
    contactsCreated: 0,
    investorsLinked: 0,
    errors: [],
  };

  const broadcasts = await listBroadcasts(limit);

  for (const b of broadcasts) {
    if (b.cancelled || b.subscriptionsCount === 0) continue;
    try {
      await syncBroadcast(b.id, b.title, b.startsAt, b.durationMinutes, result);
    } catch (e) {
      result.errors.push(`diffusion ${b.id} : ${e instanceof Error ? e.message : 'erreur'}`);
    }
  }

  result.investorsLinked = await linkContactsToInvestors();
  return result;
}
