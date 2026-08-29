import { Award, Flame, Medal, PartyPopper, Phone, Trophy } from 'lucide-react';
import Link from 'next/link';
import { BADGES, type BadgeKey } from '@/lib/closing/gamification/badges';
import {
  type FeedItem,
  getGamificationFeed,
  getLeaderboard,
  type LeaderboardEntry,
  type LeaderboardSort,
  sortEntries,
} from '@/lib/closing/gamification/leaderboard';
import type { PeriodKind } from '@/lib/closing/gamification/periods';
import { XP_RULES } from '@/lib/closing/gamification/xp';
import { ConfettiOnClose } from './confetti-on-close';

export const dynamic = 'force-dynamic';

/**
 * Le classement des closers — l'arène.
 *
 * Trois périodes (semaine / trimestre / année), quatre angles de tri, XP à vie
 * avec niveaux, badges, fil des victoires en direct et confettis quand une
 * souscription tombe. Tout est visible par tout le monde : la transparence
 * totale, c'est l'émulation (décision Killian). L'admin reste hors compétition.
 *
 * La page se recharge en direct via le LiveSync du layout closing (topic
 * « gamification », poussé par le cron d'annonces et les actions closers).
 */

const PERIOD_TABS: { key: string; kind: PeriodKind; label: string }[] = [
  { key: 'semaine', kind: 'week', label: 'Semaine' },
  { key: 'trimestre', kind: 'quarter', label: 'Trimestre' },
  { key: 'annee', kind: 'year', label: 'Année' },
];

const SORT_TABS: { key: string; sort: LeaderboardSort; label: string }[] = [
  { key: 'xp', sort: 'xp', label: 'XP' },
  { key: 'appels', sort: 'calls', label: 'Appels' },
  { key: 'inscriptions', sort: 'registrations', label: 'Inscriptions' },
  { key: 'souscriptions', sort: 'subscriptions', label: 'Souscriptions' },
  { key: 'collecte', sort: 'amount', label: 'Collecté' },
];

/** Or, argent, bronze — les couleurs du podium. */
const PODIUM = [
  {
    emoji: '🥇',
    ring: '#f59e0b',
    bg: 'linear-gradient(135deg, rgba(245,158,11,0.16), rgba(245,158,11,0.04))',
  },
  {
    emoji: '🥈',
    ring: '#94a3b8',
    bg: 'linear-gradient(135deg, rgba(148,163,184,0.16), rgba(148,163,184,0.04))',
  },
  {
    emoji: '🥉',
    ring: '#b45309',
    bg: 'linear-gradient(135deg, rgba(180,83,9,0.16), rgba(180,83,9,0.04))',
  },
];

function eur(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

function initials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function relativeTime(d: Date): string {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; tri?: string }>;
}) {
  const sp = await searchParams;
  const periodTab = PERIOD_TABS.find((t) => t.key === sp.periode) ?? PERIOD_TABS[0];
  const sortTab = SORT_TABS.find((t) => t.key === sp.tri) ?? SORT_TABS[0];
  if (!periodTab || !sortTab) return null; // jamais atteint : les listes sont non vides

  const [board, feed] = await Promise.all([
    getLeaderboard(periodTab.kind),
    getGamificationFeed(25),
  ]);
  const entries = sortEntries(board.entries, sortTab.sort);
  const latestClose = feed.find((f) => f.kind === 'sub_closed') ?? null;

  const href = (periode: string, tri: string) => {
    const p = new URLSearchParams();
    if (periode !== 'semaine') p.set('periode', periode);
    if (tri !== 'xp') p.set('tri', tri);
    const q = p.toString();
    return q ? `/closing/classement?${q}` : '/closing/classement';
  };

  const totalAmount = entries.reduce((s, e) => s + e.amountEur, 0);
  const totalCalls = entries.reduce((s, e) => s + e.calls, 0);
  const totalSubs = entries.reduce((s, e) => s + e.subscriptions, 0);

  return (
    <>
      <ConfettiOnClose latestCloseId={latestClose?.id ?? null} />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trophy size={20} style={{ color: '#f59e0b' }} />
            Classement — {board.period.label}
          </h1>
          <div className="page-desc">
            {totalCalls.toLocaleString('fr-FR')} appels · {totalSubs} souscription
            {totalSubs > 1 ? 's' : ''} · {eur(totalAmount)} collectés sur la période. Que le
            meilleur gagne.
          </div>
        </div>
        <Link href="/closing/mes-leads" className="btn btn-secondary btn-sm">
          Mes leads
        </Link>
      </div>

      {/* Période + tri */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {PERIOD_TABS.map((t) => (
            <Link
              key={t.key}
              href={href(t.key, sortTab.key)}
              className={`btn btn-sm ${t.key === periodTab.key ? 'btn-primary' : 'btn-secondary'}`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-4)' }}>Trier par :</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SORT_TABS.map((t) => (
            <Link
              key={t.key}
              href={href(periodTab.key, t.key)}
              className={t.key === sortTab.key ? 'badge badge-brand' : 'badge badge-neutral'}
              style={{ textDecoration: 'none' }}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="view-card">
          <div className="view-card-body" style={{ fontSize: 13, color: 'var(--text-3)' }}>
            Aucun closer actif pour l'instant. Les comptes avec le rôle « closer » apparaissent ici
            dès leur premier appel.
          </div>
        </div>
      ) : (
        <>
          {/* Podium */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {entries.slice(0, 3).map((e, i) => (
              <PodiumCard key={e.closerId} entry={e} rank={i} sort={sortTab.sort} />
            ))}
          </div>

          {/* Tableau complet */}
          <div className="view-card">
            <div className="table-scroll" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-4)', fontSize: 11 }}>
                    <th style={{ padding: '10px 14px' }}>#</th>
                    <th style={{ padding: '10px 8px' }}>Closer</th>
                    <th style={{ padding: '10px 8px' }}>XP période</th>
                    <th style={{ padding: '10px 8px' }}>Appels (joints)</th>
                    <th
                      style={{ padding: '10px 8px' }}
                      title="Profils complétés + KYC finalisés suite à un appel (fenêtre 30 j)"
                    >
                      Inscriptions
                    </th>
                    <th
                      style={{ padding: '10px 8px' }}
                      title="Souscriptions attribuées (appel prime, 30 j)"
                    >
                      Souscriptions
                    </th>
                    <th style={{ padding: '10px 8px' }}>Collecté</th>
                    <th style={{ padding: '10px 8px' }}>Badges</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={e.closerId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-3)' }}>
                        {PODIUM[i]?.emoji ?? i + 1}
                      </td>
                      <td style={{ padding: '10px 8px', minWidth: 190 }}>
                        <CloserIdentity entry={e} />
                      </td>
                      <td style={{ padding: '10px 8px', fontWeight: 700, color: 'var(--brand)' }}>
                        {e.xpPeriod.toLocaleString('fr-FR')}
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        {e.calls.toLocaleString('fr-FR')}{' '}
                        <span style={{ color: 'var(--text-4)' }}>({e.reached})</span>
                        {e.fastCallbacks > 0 && (
                          <span title={`${e.fastCallbacks} rappel(s) éclair < 5 min`}>
                            {' '}
                            ⚡{e.fastCallbacks}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 8px' }}>{e.registrations + e.kycs}</td>
                      <td style={{ padding: '10px 8px' }}>{e.subscriptions}</td>
                      <td style={{ padding: '10px 8px', fontWeight: 700, color: 'var(--success)' }}>
                        {eur(e.amountEur)}
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <BadgeChips badges={e.badges} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Fil des victoires + règles du jeu */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 12,
          alignItems: 'start',
        }}
      >
        <div className="view-card">
          <div className="view-card-header">
            <div
              className="view-card-title"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <PartyPopper size={15} />
              Fil des victoires
            </div>
            <span className="badge badge-neutral">en direct</span>
          </div>
          <div
            className="view-card-body"
            style={{ display: 'flex', flexDirection: 'column', gap: 0 }}
          >
            {feed.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>
                Rien encore — la première souscription closée s'affichera ici (avec confettis).
              </div>
            ) : (
              feed.map((item, idx) => (
                <FeedRow key={item.id} item={item} last={idx === feed.length - 1} />
              ))
            )}
          </div>
        </div>

        <div className="view-card">
          <div className="view-card-header">
            <div
              className="view-card-title"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Award size={15} />
              Les badges à décrocher
            </div>
          </div>
          <div
            className="view-card-body"
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {Object.values(BADGES).map((b) => (
              <div key={b.key} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontSize: 16 }}>{b.emoji}</span>
                <div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>
                    {b.label}
                  </span>{' '}
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{b.description}</span>
                </div>
              </div>
            ))}
            <div
              style={{
                marginTop: 6,
                paddingTop: 10,
                borderTop: '1px solid var(--border)',
                fontSize: 11.5,
                color: 'var(--text-4)',
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: 'var(--text-3)' }}>Le barème XP :</strong> appel{' '}
              {XP_RULES.CALL} · joint {XP_RULES.CALL + XP_RULES.REACHED_BONUS} · RDV pris{' '}
              {XP_RULES.MEETING_BOOKED} · inscription finalisée {XP_RULES.KYC_COMPLETED} ·
              souscription {XP_RULES.SUBSCRIPTION} + 1 XP / {XP_RULES.AMOUNT_EUR_PER_XP} € collectés
              · rappel &lt; 5 min +{XP_RULES.FAST_CALLBACK}. Conversions attribuées au dernier appel
              dans les 30 jours. L'XP ne se remet jamais à zéro : c'est elle qui fait monter de
              niveau.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** La valeur mise en avant sur le podium selon le tri choisi. */
function headline(e: LeaderboardEntry, sort: LeaderboardSort): string {
  if (sort === 'calls') return `${e.calls.toLocaleString('fr-FR')} appels`;
  if (sort === 'registrations') return `${e.registrations + e.kycs} inscriptions`;
  if (sort === 'subscriptions') return `${e.subscriptions} souscriptions`;
  if (sort === 'amount') return eur(e.amountEur);
  return `${e.xpPeriod.toLocaleString('fr-FR')} XP`;
}

function PodiumCard({
  entry,
  rank,
  sort,
}: {
  entry: LeaderboardEntry;
  rank: number;
  sort: LeaderboardSort;
}) {
  const style = PODIUM[rank] ?? PODIUM[2];
  if (!style) return null;
  return (
    <div
      className="view-card"
      style={{
        background: style.bg,
        borderColor: `color-mix(in srgb, ${style.ring} 45%, transparent)`,
      }}
    >
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: rank === 0 ? 30 : 24 }}>{style.emoji}</span>
          <CloserIdentity entry={entry} large={rank === 0} />
        </div>
        <div
          style={{
            fontSize: rank === 0 ? 26 : 20,
            fontWeight: 800,
            color: 'var(--text-1)',
            lineHeight: 1,
          }}
        >
          {headline(entry, sort)}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: 'var(--text-3)',
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <span title="Appels (dont joints)">
            <Phone size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /> {entry.calls} (
            {entry.reached})
          </span>
          <span title="Souscriptions attribuées">
            <Medal size={10} style={{ display: 'inline', verticalAlign: '-1px' }} />{' '}
            {entry.subscriptions}
          </span>
          <span
            title="Collecté sur la période"
            style={{ color: 'var(--success)', fontWeight: 700 }}
          >
            {eur(entry.amountEur)}
          </span>
        </div>
        <XpBar entry={entry} />
        <BadgeChips badges={entry.badges} />
      </div>
    </div>
  );
}

function CloserIdentity({ entry, large = false }: { entry: LeaderboardEntry; large?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span className={`avatar ${large ? 'avatar-lg' : ''} avatar-blue`}>
        {initials(entry.name)}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: large ? 14 : 12.5,
            fontWeight: 700,
            color: 'var(--text-1)',
          }}
        >
          {entry.name ?? 'Sans nom'}
          <span
            title={entry.online ? 'En ligne' : 'Hors ligne'}
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: entry.online ? 'var(--success)' : 'var(--text-4)',
              flexShrink: 0,
            }}
          />
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-4)' }}>
          {entry.level.emoji} {entry.level.name} · {entry.xpLife.toLocaleString('fr-FR')} XP à vie
        </div>
      </div>
    </div>
  );
}

/** Barre de progression vers le prochain niveau. */
function XpBar({ entry }: { entry: LeaderboardEntry }) {
  return (
    <div>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: 'var(--surface-2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${entry.level.progressPct}%`,
            borderRadius: 999,
            background: 'linear-gradient(90deg, var(--brand), var(--ai))',
          }}
        />
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 3 }}>
        {entry.level.next != null
          ? `${entry.xpLife.toLocaleString('fr-FR')} / ${entry.level.next.toLocaleString('fr-FR')} XP vers le niveau suivant`
          : 'Niveau maximum atteint 👑'}
      </div>
    </div>
  );
}

function BadgeChips({ badges }: { badges: { key: BadgeKey; count: number }[] }) {
  if (badges.length === 0) {
    return <span style={{ fontSize: 11, color: 'var(--text-4)' }}>aucun badge (encore)</span>;
  }
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {badges.map((b) => {
        const def = BADGES[b.key];
        if (!def) return null;
        return (
          <span
            key={b.key}
            className="badge badge-neutral"
            title={`${def.label} — ${def.description}`}
            style={{ fontSize: 11 }}
          >
            {def.emoji}
            {b.count > 1 ? ` ×${b.count}` : ''}
          </span>
        );
      })}
    </div>
  );
}

function FeedRow({ item, last }: { item: FeedItem; last: boolean }) {
  const badge = item.badge ? BADGES[item.badge] : null;
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'baseline',
        padding: '8px 0',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        fontSize: 12.5,
      }}
    >
      <span style={{ fontSize: 15, flexShrink: 0 }}>
        {item.kind === 'sub_closed' ? '🎉' : (badge?.emoji ?? '🏅')}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        {item.kind === 'sub_closed' ? (
          <span>
            <strong>{item.closerName ?? 'Un closer'}</strong> a closé{' '}
            <strong style={{ color: 'var(--success)' }}>{eur(item.amountEur ?? 0)}</strong>
            {item.investorName ? (
              <span style={{ color: 'var(--text-3)' }}> ({item.investorName})</span>
            ) : null}
            {(item.amountEur ?? 0) >= 25_000 ? ' 🔥' : ''}
          </span>
        ) : (
          <span>
            <strong>{item.closerName ?? 'Un closer'}</strong> a décroché le badge{' '}
            <strong>{badge?.label ?? item.badge}</strong>
          </span>
        )}
        <span style={{ color: 'var(--text-4)', fontSize: 11 }}>
          {' '}
          · {relativeTime(item.createdAt)}
        </span>
      </div>
      {item.kind === 'sub_closed' && (item.amountEur ?? 0) >= 50_000 && (
        <Flame size={13} style={{ color: 'var(--danger)', flexShrink: 0 }} />
      )}
    </div>
  );
}
