import 'server-only';
import { and, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { attributeAction, type Contact, type ContactKind } from '@/lib/closing/attribution';
import { db } from '@/lib/db';
import {
  closerBadges,
  gamificationEvents,
  interactions,
  subscriptions,
  users,
} from '@/lib/db/schema';
import { sendTelegram } from '@/lib/notifications/telegram';
import { notifyChange } from '@/lib/realtime/broadcast';
import { SYNC_TOPICS } from '@/lib/realtime/topics';
import { BADGES, type BadgeKey, earnedWeeklyBadges } from './badges';
import { getLeaderboard, getLeaderboardForPeriod } from './leaderboard';
import { previousPeriod } from './periods';

/**
 * Balayage gamification — tourne en cron (voir /api/cron/gamification).
 *
 * Trois missions, toutes REJOUABLES sans doublon (l'unicité vit en base) :
 *   1. décerner les badges de la semaine courante + le Roi de la semaine écoulée ;
 *   2. transformer chaque souscription attribuée en événement du fil d'activité ;
 *   3. annoncer à l'équipe (Telegram) ce qui ne l'a pas encore été.
 * Puis un signal temps réel : les classements ouverts se rafraîchissent seuls.
 */

/** On ne regarde que les souscriptions récentes : le fil vit au présent. */
const SUB_LOOKBACK_HOURS = 72;
/** Un événement plus vieux que ça ne sonne plus les téléphones (rattrapage silencieux). */
const ANNOUNCE_MAX_AGE_HOURS = 24;

export type SweepResult = {
  badgesAwarded: number;
  subEvents: number;
  announced: number;
};

export async function runGamificationSweep(now: Date = new Date()): Promise<SweepResult> {
  let badgesAwarded = 0;
  let subEvents = 0;

  // --- 1. Badges de la semaine courante -------------------------------------
  const week = await getLeaderboard('week', now);
  for (const entry of week.entries) {
    const earned = earnedWeeklyBadges(entry.activity);
    for (const badge of earned) {
      badgesAwarded += await awardBadge(entry.closerId, badge, week.period.key);
    }
  }

  // --- 1 bis. Roi de la semaine ÉCOULÉE -------------------------------------
  // UN SEUL roi par semaine : si le badge a déjà été décerné pour cette clé
  // (même à un autre closer — les stats bougent après coup, synchro tardive),
  // on ne couronne pas un deuxième roi.
  const prevWeek = previousPeriod('week', now);
  const alreadyCrowned = await db
    .select({ id: closerBadges.id })
    .from(closerBadges)
    .where(and(eq(closerBadges.badge, 'roi_semaine'), eq(closerBadges.periodKey, prevWeek.key)))
    .limit(1);
  if (alreadyCrowned.length === 0) {
    const prevBoard = await getLeaderboardForPeriod(prevWeek, now);
    const king = prevBoard.entries[0];
    if (king && king.xpPeriod > 0) {
      badgesAwarded += await awardBadge(king.closerId, 'roi_semaine', prevWeek.key);
    }
  }

  // --- 2. Souscriptions récentes attribuées → événements du fil -------------
  subEvents = await recordSubscriptionEvents(now);

  // --- 3. Annonces Telegram --------------------------------------------------
  const announced = await announcePendingEvents(now);

  if (badgesAwarded > 0 || subEvents > 0) {
    await notifyChange(SYNC_TOPICS.gamification);
  }
  return { badgesAwarded, subEvents, announced };
}

/** Décerne un badge s'il ne l'est pas déjà. Renvoie 1 si nouveau, 0 sinon. */
async function awardBadge(closerId: string, badge: BadgeKey, periodKey: string): Promise<number> {
  const inserted = await db
    .insert(closerBadges)
    .values({ closerId, badge, periodKey })
    .onConflictDoNothing()
    .returning({ id: closerBadges.id });
  if (inserted.length === 0) return 0;
  await db
    .insert(gamificationEvents)
    .values({
      kind: 'badge_awarded',
      refId: `badge:${closerId}:${badge}:${periodKey}`,
      closerId,
      badge,
    })
    .onConflictDoNothing();
  return 1;
}

const EMAIL_KIND: Record<string, ContactKind> = {
  email_clicked: 'click',
  email_opened: 'open',
};

/** Souscriptions signées récemment + attribuées à un closer → événements « sub_closed ». */
async function recordSubscriptionEvents(now: Date): Promise<number> {
  const since = new Date(now.getTime() - SUB_LOOKBACK_HOURS * 3_600_000);
  const subs = await db
    .select({
      id: subscriptions.id,
      investorId: subscriptions.investorId,
      amount: subscriptions.amount,
      signedAt: subscriptions.signedAt,
    })
    .from(subscriptions)
    .where(
      and(
        sql`${subscriptions.status} <> 'cancelled'`,
        isNotNull(subscriptions.signedAt),
        gte(subscriptions.signedAt, since),
      ),
    );
  if (subs.length === 0) return 0;

  // Contacts des seuls investisseurs concernés — pas besoin de toute la table.
  const investorIds = [...new Set(subs.map((s) => s.investorId))];
  const contactRows = await db
    .select({
      investorId: interactions.investorId,
      userId: interactions.userId,
      type: interactions.type,
      at: interactions.createdAt,
    })
    .from(interactions)
    .where(
      and(
        inArray(interactions.type, [
          'call_outbound',
          'call_inbound',
          'email_opened',
          'email_clicked',
        ]),
        inArray(interactions.investorId, investorIds),
      ),
    );
  const contactsByInvestor = new Map<string, Contact[]>();
  for (const c of contactRows) {
    if (!c.investorId) continue;
    const kind: ContactKind = c.type.startsWith('call') ? 'call' : (EMAIL_KIND[c.type] ?? 'open');
    const list = contactsByInvestor.get(c.investorId) ?? [];
    list.push({ kind, at: c.at, userId: c.userId });
    contactsByInvestor.set(c.investorId, list);
  }

  let created = 0;
  for (const s of subs) {
    if (!s.signedAt) continue;
    const res = attributeAction(s.signedAt, contactsByInvestor.get(s.investorId) ?? []);
    if (!res.attributed || res.via !== 'call' || !res.userId) continue;
    const inserted = await db
      .insert(gamificationEvents)
      .values({
        kind: 'sub_closed',
        refId: `sub:${s.id}`,
        closerId: res.userId,
        investorId: s.investorId,
        amount: s.amount,
      })
      .onConflictDoNothing()
      .returning({ id: gamificationEvents.id });
    created += inserted.length;
  }
  return created;
}

function euros(amount: number): string {
  return `${Math.round(amount).toLocaleString('fr-FR')} €`;
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Annonce à toute l'équipe (Telegram) les événements pas encore annoncés.
 * Marqués « annoncés » même si l'envoi échoue partiellement : mieux vaut une
 * annonce perdue que la même victoire hurlée trois fois.
 */
async function announcePendingEvents(now: Date): Promise<number> {
  const maxAge = new Date(now.getTime() - ANNOUNCE_MAX_AGE_HOURS * 3_600_000);
  // Les trop vieux jamais annoncés sont clos silencieusement : un rattrapage
  // (panne de cron, import historique) ne doit pas mitrailler les téléphones.
  await db
    .update(gamificationEvents)
    .set({ announcedAt: now })
    .where(
      and(
        isNull(gamificationEvents.announcedAt),
        sql`${gamificationEvents.createdAt} < ${maxAge.toISOString()}::timestamptz`,
      ),
    );

  const pending = await db
    .select({
      id: gamificationEvents.id,
      kind: gamificationEvents.kind,
      amount: gamificationEvents.amount,
      badge: gamificationEvents.badge,
      closerId: gamificationEvents.closerId,
    })
    .from(gamificationEvents)
    .where(isNull(gamificationEvents.announcedAt))
    .limit(20);
  if (pending.length === 0) return 0;

  const closerIds = [...new Set(pending.map((p) => p.closerId).filter((id): id is string => !!id))];
  const closerRows = closerIds.length
    ? await db
        .select({ id: users.id, name: users.fullName })
        .from(users)
        .where(inArray(users.id, closerIds))
    : [];
  const nameById = new Map(closerRows.map((c) => [c.id, c.name ?? 'Un closer']));

  const recipients = await db
    .select({ chatId: users.telegramChatId })
    .from(users)
    .where(
      and(
        inArray(users.role, ['admin', 'closer', 'closer_junior']),
        eq(users.active, true),
        isNotNull(users.telegramChatId),
      ),
    );

  let announced = 0;
  for (const ev of pending) {
    // RÉSERVATION ATOMIQUE avant l'envoi : deux balayages concurrents (deux
    // instances serveur) liraient la même liste — seul celui qui pose
    // announced_at le premier envoie. Mieux une annonce perdue que doublée.
    const claimed = await db
      .update(gamificationEvents)
      .set({ announcedAt: now })
      .where(and(eq(gamificationEvents.id, ev.id), isNull(gamificationEvents.announcedAt)))
      .returning({ id: gamificationEvents.id });
    if (claimed.length === 0) continue;

    const closer = esc(ev.closerId ? (nameById.get(ev.closerId) ?? 'Un closer') : 'Un closer');
    let message: string | null = null;
    if (ev.kind === 'sub_closed' && ev.amount != null) {
      message = `🎉 <b>${closer}</b> vient de closer <b>${euros(Number(ev.amount))}</b> ! GG 🔥`;
    } else if (ev.kind === 'badge_awarded' && ev.badge && ev.badge in BADGES) {
      const def = BADGES[ev.badge as BadgeKey];
      message = `🏅 <b>${closer}</b> décroche le badge ${def.emoji} <b>${def.label}</b> — ${esc(def.description)}`;
    }

    if (message) {
      for (const r of recipients) {
        if (!r.chatId) continue;
        const res = await sendTelegram(r.chatId, message);
        if (!res.ok) console.warn(`[gamification] annonce Telegram ratée : ${res.error}`);
      }
    }
    announced += 1;
  }
  return announced;
}
