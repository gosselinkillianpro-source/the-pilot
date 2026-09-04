import 'server-only';
import { and, count, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { investorOrigin } from '@/lib/closing/origin';
import { db } from '@/lib/db';
import {
  creditedCloserForEvent,
  creditSubscriptionRows,
  loadOwnerActions,
} from '@/lib/db/queries/credit-data';
import {
  closerBadges,
  gamificationEvents,
  interactions,
  investors,
  subscriptions,
  users,
} from '@/lib/db/schema';
import type { BadgeKey, WeekActivity } from './badges';
import { currentPeriod, type GamePeriod, type PeriodKind } from './periods';
import { computeXp, FAST_CALLBACK_MAX_MINUTES, type Level, levelFor, type XpInputs } from './xp';

/**
 * Classement des closers — tout est DÉRIVÉ des données réelles à la demande :
 * appels (`interactions`), souscriptions créditées (règle du 4 sept. 2026 :
 * au propriétaire, première souscription sous 90 j puis action sous 30 j —
 * `lib/closing/credit.ts`), progressions d'inscription détectées au sync.
 * Rien de stocké, donc rien qui puisse se désynchroniser du réel.
 *
 * Volume : 4 closers et quelques milliers d'interactions — le calcul en
 * mémoire est très en dessous du seuil où il faudrait pré-agréger.
 */

const ONLINE_WINDOW_MIN = 5;

export type LeaderboardEntry = {
  closerId: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  online: boolean;
  /** Stats de la PÉRIODE demandée (celles qui classent). */
  calls: number;
  reached: number;
  meetingsBooked: number;
  /** Inscriptions attribuées (profil complété + KYC finalisé). */
  registrations: number;
  kycs: number;
  subscriptions: number;
  amountEur: number;
  /** Dont souscriptions de personnes venues des pubs (code BREACH) — le closer a tout fait. */
  subscriptionsAds: number;
  amountAdsEur: number;
  fastCallbacks: number;
  xpPeriod: number;
  /** XP à vie + niveau (jamais remis à zéro). */
  xpLife: number;
  level: Level;
  /** Collection de badges (toutes semaines confondues). */
  badges: { key: BadgeKey; count: number }[];
  /** Activité détaillée de la période (sert à l'évaluation des badges). */
  activity: WeekActivity;
};

export type Leaderboard = { period: GamePeriod; entries: LeaderboardEntry[] };

/** Tris proposés au classement. */
export type LeaderboardSort = 'xp' | 'calls' | 'registrations' | 'subscriptions' | 'amount';

export function sortEntries(entries: LeaderboardEntry[], by: LeaderboardSort): LeaderboardEntry[] {
  const keyOf = (e: LeaderboardEntry): number => {
    if (by === 'calls') return e.calls;
    if (by === 'registrations') return e.registrations + e.kycs;
    if (by === 'subscriptions') return e.subscriptions;
    if (by === 'amount') return e.amountEur;
    return e.xpPeriod;
  };
  // Copie triée (pas de mutation) ; l'XP départage les ex æquo, puis
  // l'identifiant : sans départage TOTAL, deux closers à égalité changeaient
  // de place à chaque refresh — et le « Roi de la semaine » se tirait au sort.
  return [...entries].sort(
    (a, b) =>
      keyOf(b) - keyOf(a) || b.xpPeriod - a.xpPeriod || a.closerId.localeCompare(b.closerId),
  );
}

/** Jour civil parisien « 2026-08-29 » d'un instant. */
function parisDayKey(at: Date): string {
  const parts = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  return parts; // fr-CA produit déjà YYYY-MM-DD
}

/** Heure décimale parisienne (9 h 30 → 9.5). */
function parisDecimalHour(at: Date): number {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(at);
  const get = (type: string) =>
    Number.parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  return get('hour') + get('minute') / 60;
}

const EARLY_CALL_MAX_HOUR = 9.5;

type MutableStats = XpInputs & {
  maxSubscriptionEur: number;
  subscriptionsAds: number;
  amountAdsEur: number;
};

function emptyStats(): MutableStats {
  return {
    calls: 0,
    reached: 0,
    meetingsBooked: 0,
    registrations: 0,
    kycs: 0,
    subscriptions: 0,
    amountEur: 0,
    fastCallbacks: 0,
    maxSubscriptionEur: 0,
    subscriptionsAds: 0,
    amountAdsEur: 0,
  };
}

type OriginRow = {
  id: string;
  bonus_code: string | null;
  breach_level: number | string | null;
  parent_sah_id: string | null;
  cgp_name: string | null;
  cgp_network: string | null;
};

export async function getLeaderboard(
  kind: PeriodKind,
  now: Date = new Date(),
): Promise<Leaderboard> {
  const period = currentPeriod(kind, now);
  return getLeaderboardForPeriod(period, now);
}

/** Variante à période explicite — sert au « Roi de la semaine » écoulée. */
export async function getLeaderboardForPeriod(
  period: GamePeriod,
  now: Date = new Date(),
): Promise<Leaderboard> {
  // Le classement compare les CLOSERS entre eux (décision Killian : l'admin
  // reste hors compétition, ses appels sont tracés mais pas classés).
  const closers = await db
    .select({
      id: users.id,
      name: users.fullName,
      avatarUrl: users.avatarUrl,
      role: users.role,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(and(inArray(users.role, ['closer', 'closer_junior']), eq(users.active, true)));
  if (closers.length === 0) return { period, entries: [] };

  const [contactRows, subRows, progressRows, firstCallRows, badgeRows, owners, originRows] =
    await Promise.all([
      // L'activité qui fait les stats : appels + RDV pris.
      db
        .select({
          investorId: interactions.investorId,
          userId: interactions.userId,
          type: interactions.type,
          outcome: interactions.outcome,
          at: interactions.createdAt,
        })
        .from(interactions)
        .where(inArray(interactions.type, ['call_outbound', 'call_inbound', 'meeting_booked'])),
      db
        .select({
          id: subscriptions.id,
          investorId: subscriptions.investorId,
          amount: subscriptions.amount,
          signedAt: subscriptions.signedAt,
        })
        .from(subscriptions)
        .where(and(sql`${subscriptions.status} <> 'cancelled'`, isNotNull(subscriptions.signedAt))),
      db
        .select({
          investorId: investors.id,
          kycAt: investors.kycCompletedAt,
          regAt: investors.registrationCompletedAt,
        })
        .from(investors)
        .where(
          sql`${investors.deletedAt} is null and (${investors.kycCompletedAt} is not null or ${investors.registrationCompletedAt} is not null)`,
        ),
      // 1er appel sortant de chaque inscrit : la matière du bonus éclair.
      db.execute(sql`
      select distinct on (ix.investor_id)
        ix.investor_id, ix.user_id::text as user_id, ix.created_at as at, i.sah_created_at
      from interactions ix
      join investors i on i.id = ix.investor_id
      where ix.type = 'call_outbound' and ix.user_id is not null and i.sah_created_at is not null
      order by ix.investor_id, ix.created_at asc
    `) as unknown as Promise<
        { investor_id: string; user_id: string; at: string | Date; sah_created_at: string | Date }[]
      >,
      db
        .select({ closerId: closerBadges.closerId, badge: closerBadges.badge, n: count() })
        .from(closerBadges)
        .groupBy(closerBadges.closerId, closerBadges.badge),
      // Propriétaire + ses actions par personne : la matière du crédit.
      loadOwnerActions(),
      // Origine de chaque personne (pub, parrainage…) : la part des pubs par closer.
      db.execute(sql`
      select id::text as id, bonus_code, breach_level, parent_sah_id, cgp_name, cgp_network
      from investors where deleted_at is null
    `) as unknown as Promise<OriginRow[]>,
    ]);
  const originById = new Map(
    originRows.map((r) => [
      r.id,
      investorOrigin({
        bonusCode: r.bonus_code,
        breachLevel: r.breach_level != null ? Number(r.breach_level) : null,
        parentSahId: r.parent_sah_id,
        cgpName: r.cgp_name,
        cgpNetwork: r.cgp_network,
      }),
    ]),
  );

  const inPeriod = (at: Date) => at >= period.from && at < period.to;

  const periodStats = new Map<string, MutableStats>();
  const lifeStats = new Map<string, MutableStats>();
  const callsByDay = new Map<string, Record<string, number>>();
  const earlyCall = new Map<string, boolean>();
  for (const c of closers) {
    periodStats.set(c.id, emptyStats());
    lifeStats.set(c.id, emptyStats());
    callsByDay.set(c.id, {});
    earlyCall.set(c.id, false);
  }

  for (const row of contactRows) {
    const at = new Date(row.at);
    const isCall = row.type === 'call_outbound' || row.type === 'call_inbound';

    if (!row.userId) continue;
    const life = lifeStats.get(row.userId);
    if (!life) continue; // action d'un admin / compte hors classement
    const stats = inPeriod(at) ? periodStats.get(row.userId) : null;

    if (isCall) {
      life.calls += 1;
      if (row.outcome === 'reached') life.reached += 1;
      if (stats) {
        stats.calls += 1;
        if (row.outcome === 'reached') stats.reached += 1;
        const days = callsByDay.get(row.userId);
        if (days) {
          const day = parisDayKey(at);
          days[day] = (days[day] ?? 0) + 1;
        }
        if (parisDecimalHour(at) < EARLY_CALL_MAX_HOUR) earlyCall.set(row.userId, true);
      }
    } else if (row.type === 'meeting_booked') {
      life.meetingsBooked += 1;
      if (stats) stats.meetingsBooked += 1;
    }
  }

  // Bonus éclair : 1er appel du lead < 5 min après son inscription.
  for (const row of firstCallRows) {
    const life = lifeStats.get(row.user_id);
    if (!life) continue;
    const callAt = new Date(row.at);
    const signedUpAt = new Date(row.sah_created_at);
    const minutes = (callAt.getTime() - signedUpAt.getTime()) / 60_000;
    if (minutes < 0 || minutes > FAST_CALLBACK_MAX_MINUTES) continue;
    life.fastCallbacks += 1;
    if (inPeriod(callAt)) {
      const stats = periodStats.get(row.user_id);
      if (stats) stats.fastCallbacks += 1;
    }
  }

  // Souscriptions créditées (propriétaire ; 1re sous 90 j, suivantes sous 30 j)
  // — les € qui classent. Toutes les souscriptions passent au moteur : la
  // notion de « première » dépend de l'historique complet de la personne.
  const credits = creditSubscriptionRows(
    subRows.flatMap((s) =>
      s.signedAt
        ? [
            {
              id: s.id,
              investorId: s.investorId,
              signedAt: new Date(s.signedAt),
              amountEur: Number(s.amount) || 0,
            },
          ]
        : [],
    ),
    owners,
  );
  for (const c of credits.values()) {
    if (!c.credited || !c.closerId) continue;
    const life = lifeStats.get(c.closerId);
    if (!life) continue; // propriétaire hors classement (admin)
    const amount = c.amountEur;
    const fromAds = originById.get(c.investorId) === 'ads';
    life.subscriptions += 1;
    life.amountEur += amount;
    life.maxSubscriptionEur = Math.max(life.maxSubscriptionEur, amount);
    if (fromAds) {
      life.subscriptionsAds += 1;
      life.amountAdsEur += amount;
    }
    if (inPeriod(c.signedAt)) {
      const stats = periodStats.get(c.closerId);
      if (stats) {
        stats.subscriptions += 1;
        stats.amountEur += amount;
        stats.maxSubscriptionEur = Math.max(stats.maxSubscriptionEur, amount);
        if (fromAds) {
          stats.subscriptionsAds += 1;
          stats.amountAdsEur += amount;
        }
      }
    }
  }

  // Progressions d'inscription créditées (profil complété, KYC finalisé) :
  // au propriétaire, s'il a eu une action dans les 90 jours avant.
  for (const p of progressRows) {
    for (const [at, field] of [
      [p.regAt, 'registrations'],
      [p.kycAt, 'kycs'],
    ] as const) {
      if (!at) continue;
      const closerId = creditedCloserForEvent(p.investorId, new Date(at), owners);
      if (!closerId) continue;
      const life = lifeStats.get(closerId);
      if (!life) continue;
      life[field] += 1;
      if (inPeriod(new Date(at))) {
        const stats = periodStats.get(closerId);
        if (stats) stats[field] += 1;
      }
    }
  }

  const badgesByCloser = new Map<string, { key: BadgeKey; count: number }[]>();
  for (const b of badgeRows) {
    const list = badgesByCloser.get(b.closerId) ?? [];
    list.push({ key: b.badge as BadgeKey, count: Number(b.n) });
    badgesByCloser.set(b.closerId, list);
  }

  const nowMs = now.getTime();
  const entries: LeaderboardEntry[] = closers.map((c) => {
    const p = periodStats.get(c.id) ?? emptyStats();
    const life = lifeStats.get(c.id) ?? emptyStats();
    const xpLife = computeXp(life);
    return {
      closerId: c.id,
      name: c.name,
      avatarUrl: c.avatarUrl,
      role: c.role,
      online:
        c.lastSeenAt != null &&
        nowMs - new Date(c.lastSeenAt).getTime() < ONLINE_WINDOW_MIN * 60_000,
      calls: p.calls,
      reached: p.reached,
      meetingsBooked: p.meetingsBooked,
      registrations: p.registrations,
      kycs: p.kycs,
      subscriptions: p.subscriptions,
      amountEur: Math.round(p.amountEur),
      subscriptionsAds: p.subscriptionsAds,
      amountAdsEur: Math.round(p.amountAdsEur),
      fastCallbacks: p.fastCallbacks,
      xpPeriod: computeXp(p),
      xpLife,
      level: levelFor(xpLife),
      badges: badgesByCloser.get(c.id) ?? [],
      activity: {
        fastCallbacks: p.fastCallbacks,
        callsByDay: callsByDay.get(c.id) ?? {},
        subscriptions: p.subscriptions,
        maxSubscriptionEur: p.maxSubscriptionEur,
        hasEarlyCall: earlyCall.get(c.id) ?? false,
      },
    };
  });

  return { period, entries: sortEntries(entries, 'xp') };
}

/* ============================================================
   Fil d'activité (souscriptions closées, badges décrochés)
   ============================================================ */

export type FeedItem = {
  id: string;
  kind: string;
  closerName: string | null;
  investorName: string | null;
  amountEur: number | null;
  badge: BadgeKey | null;
  createdAt: Date;
};

export async function getGamificationFeed(limit = 30): Promise<FeedItem[]> {
  const rows = await db
    .select({
      id: gamificationEvents.id,
      kind: gamificationEvents.kind,
      closerName: users.fullName,
      investorName: investors.fullName,
      amount: gamificationEvents.amount,
      badge: gamificationEvents.badge,
      createdAt: gamificationEvents.createdAt,
    })
    .from(gamificationEvents)
    .leftJoin(users, eq(gamificationEvents.closerId, users.id))
    .leftJoin(investors, eq(gamificationEvents.investorId, investors.id))
    .orderBy(desc(gamificationEvents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    closerName: r.closerName,
    investorName: r.investorName,
    amountEur: r.amount != null ? Math.round(Number(r.amount)) : null,
    badge: (r.badge as BadgeKey | null) ?? null,
    createdAt: r.createdAt,
  }));
}
