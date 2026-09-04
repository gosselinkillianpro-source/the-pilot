import {
  CalendarClock,
  Megaphone,
  Phone,
  PhoneOutgoing,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CloserPicker } from '@/components/closing/closer-picker';
import { getAuthenticatedUser } from '@/lib/auth';
import { eur, fmtDay } from '@/lib/closing/format';
import { BADGES, type BadgeKey } from '@/lib/closing/gamification/badges';
import {
  getLeaderboardForPeriod,
  type LeaderboardEntry,
} from '@/lib/closing/gamification/leaderboard';
import type { GamePeriod } from '@/lib/closing/gamification/periods';
import {
  ORIGIN_GROUP_LABELS,
  type OriginGroup,
  originGroup,
  originMeta,
} from '@/lib/closing/origin';
import { resolvePortfolioPeriod } from '@/lib/closing/portfolio';
import { getPeriodExtras } from '@/lib/db/queries/closer-day';
import { listOwnerSubscriptions, type OwnerSubscription } from '@/lib/db/queries/portfolio';
import { resolveViewedCloser } from '@/lib/db/queries/viewed-closer';

/**
 * « Mes résultats » — ce que ça a rapporté (refonte du 4 sept. 2026).
 *
 * Une période, les chiffres, la liste nominative des souscriptions créditées
 * avec la raison du crédit, celles qui ne le sont pas (pas de chiffre sans
 * explication), où l'on se situe dans l'équipe. Tout suit la période.
 *
 * Deux familles séparées (demande de Killian) : les personnes venues des
 * pubs — le closer a tout fait — et celles venues autrement (parrainage,
 * invitation, partenaire), qui arrivaient déjà avec une idée du montant.
 */

export const dynamic = 'force-dynamic';

const BASE = '/closing/resultats';

const PERIOD_TABS: { key: 'semaine' | 'mois' | 'tout'; label: string }[] = [
  { key: 'semaine', label: 'Semaine' },
  { key: 'mois', label: 'Mois' },
  { key: 'tout', label: 'Tout' },
];

const ORIGIN_TABS: { key: OriginGroup | 'toutes'; label: string }[] = [
  { key: 'toutes', label: 'Toutes origines' },
  { key: 'ads', label: 'Pubs' },
  { key: 'other', label: 'Venus autrement' },
];

type Params = { closer?: string; periode?: string; du?: string; au?: string; origine?: string };

export default async function ResultsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [sp, user] = await Promise.all([searchParams, getAuthenticatedUser()]);
  const viewed = await resolveViewedCloser(user, sp.closer);
  const now = new Date();
  const period = resolvePortfolioPeriod(sp, now);
  const gamePeriod: GamePeriod = {
    kind: 'week',
    key: `custom:${period.key}`,
    label: period.label,
    from: period.from ?? new Date(0),
    to: period.to ?? new Date(now.getTime() + 366 * 86_400_000),
  };
  const originFilter: OriginGroup | null =
    sp.origine === 'ads' ? 'ads' : sp.origine === 'other' ? 'other' : null;

  const [board, subs, extras] = await Promise.all([
    getLeaderboardForPeriod(gamePeriod, now),
    listOwnerSubscriptions(viewed.viewedId),
    getPeriodExtras(viewed.viewedId, period.from, period.to),
  ]);

  const inPeriod = (d: Date) =>
    d.getTime() >= gamePeriod.from.getTime() && d.getTime() < gamePeriod.to.getTime();
  const periodSubs = subs.filter((s) => inPeriod(s.signedAt));
  const credited = periodSubs.filter((s) => s.credited);
  const creditedAds = credited.filter((s) => originGroup(s.origin) === 'ads');
  const creditedOther = credited.filter((s) => originGroup(s.origin) === 'other');
  const sum = (list: OwnerSubscription[]) => list.reduce((t, s) => t + s.amountEur, 0);

  const shownCredited = originFilter
    ? credited.filter((s) => originGroup(s.origin) === originFilter)
    : credited;
  const shownNotCredited = periodSubs.filter(
    (s) => !s.credited && (!originFilter || originGroup(s.origin) === originFilter),
  );

  const entries = board.entries;
  const myIndex = entries.findIndex((e) => e.closerId === viewed.viewedId);
  const mine: LeaderboardEntry | undefined = myIndex >= 0 ? entries[myIndex] : undefined;

  const href = (over: Partial<Params>) => {
    const next: Params = {
      closer: sp.closer,
      periode: sp.periode,
      du: sp.du,
      au: sp.au,
      origine: sp.origine,
      ...over,
    };
    const p = new URLSearchParams();
    if (next.closer) p.set('closer', next.closer);
    if (next.periode && next.periode !== 'tout') p.set('periode', next.periode);
    if (next.du && next.au) {
      p.set('du', next.du);
      p.set('au', next.au);
    }
    if (next.origine && next.origine !== 'toutes') p.set('origine', next.origine);
    const s = p.toString();
    return s ? `${BASE}?${s}` : BASE;
  };
  const backHref = href({});
  const reachRate = mine && mine.calls > 0 ? Math.round((mine.reached / mine.calls) * 100) : null;

  return (
    <>
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
            <Trophy size={20} style={{ color: 'var(--brand)' }} />
            {viewed.isMine ? 'Mes résultats' : `Résultats de ${viewed.viewedName ?? 'ce closer'}`}
          </h1>
          <div className="page-desc">
            {period.label} · une souscription est créditée au closer de la personne : la première
            avec une action dans les 90 jours avant, les suivantes avec une action dans les 30 jours
            avant la signature.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {PERIOD_TABS.map((t) => {
            const active = period.key === t.key;
            return (
              <Link
                key={t.key}
                href={href({ periode: t.key, du: undefined, au: undefined })}
                className={active ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                aria-current={active ? 'page' : undefined}
              >
                {t.label}
              </Link>
            );
          })}
          <form
            action={BASE}
            method="get"
            style={{ display: 'flex', gap: 6, alignItems: 'center' }}
          >
            {sp.closer ? <input type="hidden" name="closer" value={sp.closer} /> : null}
            {sp.origine ? <input type="hidden" name="origine" value={sp.origine} /> : null}
            <input
              type="date"
              name="du"
              defaultValue={sp.du ?? ''}
              className="input"
              aria-label="Du"
            />
            <input
              type="date"
              name="au"
              defaultValue={sp.au ?? ''}
              className="input"
              aria-label="Au"
            />
            <button type="submit" className="btn btn-secondary btn-sm">
              Filtrer
            </button>
          </form>
        </div>
      </div>

      <CloserPicker
        viewed={viewed}
        basePath={BASE}
        params={{ periode: sp.periode, du: sp.du, au: sp.au, origine: sp.origine }}
      />

      {mine ? (
        <div className="kpi-grid">
          <Stat icon={<PhoneOutgoing size={14} />} label="appels" value={String(mine.calls)} />
          <Stat
            icon={<Phone size={14} />}
            label={reachRate != null ? `joints · ${reachRate} %` : 'joints'}
            value={String(mine.reached)}
            accent="var(--success)"
          />
          <Stat
            icon={<CalendarClock size={14} />}
            label="RDV pris"
            value={String(mine.meetingsBooked)}
          />
          <Stat label="KYC débloqués" value={String(mine.kycs)} />
          <Stat label="inscriptions finalisées" value={String(mine.registrations)} />
          <Stat
            icon={<Wallet size={14} />}
            label={`collectés grâce à toi · ${mine.subscriptions} souscription${mine.subscriptions > 1 ? 's' : ''}`}
            value={eur(mine.amountEur)}
            accent="var(--brand)"
          />
          <Stat
            icon={<Trophy size={14} />}
            label={`#${myIndex + 1} sur ${entries.length} · ${mine.level.name}`}
            value={`${mine.xpPeriod.toLocaleString('fr-FR')} XP`}
            accent="var(--ai)"
          />
          <Stat
            label="délai moyen avant le 1er appel (nouveaux inscrits)"
            value={
              extras.avgFirstCallMinutes != null ? fmtMinutes(extras.avgFirstCallMinutes) : '—'
            }
          />
        </div>
      ) : (
        <div className="kpi-grid">
          <Stat label="souscriptions créditées" value={String(credited.length)} />
          <Stat
            icon={<Wallet size={14} />}
            label="collectés"
            value={eur(sum(credited))}
            accent="var(--brand)"
          />
          <Stat label="clients pris sur la période" value={String(extras.clientsTaken)} />
          <Stat label="classement" value="hors compétition" />
        </div>
      )}

      {/* Pubs contre venus autrement : deux colonnes, mêmes chiffres */}
      <div className="view-card">
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Megaphone size={15} />
            Pubs et venus autrement
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
            Pub = code BREACH ou funnel pub, le closer fait tout · autrement = parrainage,
            invitation, partenaire
          </span>
        </div>
        <div
          className="view-card-body"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          <OriginColumn
            group="ads"
            subs={creditedAds}
            clientsTaken={extras.clientsTakenAds}
            href={href({ origine: 'ads' })}
            active={originFilter === 'ads'}
          />
          <OriginColumn
            group="other"
            subs={creditedOther}
            clientsTaken={extras.clientsTakenOther}
            href={href({ origine: 'other' })}
            active={originFilter === 'other'}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-4)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginRight: 4,
          }}
        >
          Afficher
        </span>
        {ORIGIN_TABS.map((t) => {
          const active = (originFilter ?? 'toutes') === t.key;
          return (
            <Link
              key={t.key}
              href={href({ origine: t.key })}
              className={active ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              aria-current={active ? 'page' : undefined}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <SubsCard
            title="Souscriptions créditées"
            subs={shownCredited}
            total={sum(shownCredited)}
            backHref={backHref}
            empty="Aucune souscription créditée sur la période."
          />
          {shownNotCredited.length > 0 ? (
            <SubsCard
              title="Souscriptions de tes clients non créditées"
              subs={shownNotCredited}
              total={sum(shownNotCredited)}
              backHref={backHref}
              empty=""
              muted
            />
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div className="view-card">
            <div className="view-card-header">
              <div
                className="view-card-title"
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Trophy size={15} />
                Où je me situe
              </div>
              <span className="badge badge-neutral">{period.label}</span>
            </div>
            <div className="view-card-body" style={{ padding: '6px 16px', fontSize: 12.5 }}>
              {entries.length === 0 ? (
                <span style={{ color: 'var(--text-4)' }}>Pas encore de classement.</span>
              ) : (
                entries.map((e, i) => {
                  const me = e.closerId === viewed.viewedId;
                  return (
                    <div
                      key={e.closerId}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '28px 1fr auto',
                        gap: 8,
                        padding: '6px 0',
                        borderBottom: i < entries.length - 1 ? '1px solid var(--border)' : 'none',
                        fontWeight: me ? 600 : 400,
                        color: me ? 'var(--brand-text, var(--text-1))' : undefined,
                      }}
                    >
                      <span>{['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`}</span>
                      <span>
                        {e.name ?? 'Closer'}
                        {me ? ' (toi)' : ''}
                      </span>
                      <span
                        style={{
                          color: 'var(--text-3)',
                          fontVariantNumeric: 'tabular-nums',
                          textAlign: 'right',
                        }}
                      >
                        {e.xpPeriod.toLocaleString('fr-FR')} XP · {eur(e.amountEur)}
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-4)' }}>
                          dont pubs {eur(e.amountAdsEur)}
                        </span>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {mine && mine.badges.length > 0 ? (
            <div className="view-card">
              <div className="view-card-header">
                <div className="view-card-title">Badges</div>
              </div>
              <div
                className="view-card-body"
                style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12.5 }}
              >
                {mine.badges.map((b) => {
                  const def = BADGES[b.key as BadgeKey];
                  return (
                    <span key={b.key} className="badge badge-neutral" title={def?.description}>
                      {def?.emoji ?? '🏅'} {def?.label ?? b.key}
                      {b.count > 1 ? ` ×${b.count}` : ''}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function fmtMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${String(min % 60).padStart(2, '0')}`;
  return `${Math.round(h / 24)} j`;
}

function Stat({
  icon,
  label,
  value,
  accent = 'var(--text-3)',
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="view-card">
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.1 }}>
          {value}
        </span>
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: accent, fontSize: 11 }}
        >
          {icon}
          {label}
        </span>
      </div>
    </div>
  );
}

function OriginColumn({
  group,
  subs,
  clientsTaken,
  href,
  active,
}: {
  group: OriginGroup;
  subs: OwnerSubscription[];
  clientsTaken: number;
  href: string;
  active: boolean;
}) {
  const total = subs.reduce((t, s) => t + s.amountEur, 0);
  const investors = new Set(subs.map((s) => s.investorId)).size;
  return (
    <div
      style={{
        border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
        borderRadius: 12,
        padding: '12px 14px',
        display: 'grid',
        gap: 6,
        background: group === 'ads' ? 'var(--ai-bg)' : 'var(--surface-2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {group === 'ads' ? <Megaphone size={14} /> : <Users size={14} />}
        <span style={{ fontWeight: 600 }}>{ORIGIN_GROUP_LABELS[group]}</span>
        <Link href={href} className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>
          voir
        </Link>
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {eur(total)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
        {subs.length} souscription{subs.length > 1 ? 's' : ''} créditée{subs.length > 1 ? 's' : ''}{' '}
        · {investors} personne{investors > 1 ? 's' : ''} · {clientsTaken} client
        {clientsTaken > 1 ? 's' : ''} pris sur la période
      </div>
    </div>
  );
}

function SubsCard({
  title,
  subs,
  total,
  backHref,
  empty,
  muted = false,
}: {
  title: string;
  subs: OwnerSubscription[];
  total: number;
  backHref: string;
  empty: string;
  muted?: boolean;
}) {
  return (
    <div className="view-card" style={muted ? { opacity: 0.85 } : undefined}>
      <div className="view-card-header">
        <div className="view-card-title">{title}</div>
        <span className="badge badge-neutral">
          {subs.length} · {eur(total)}
        </span>
      </div>
      <div className="view-card-body" style={{ padding: 0 }}>
        {subs.length === 0 ? (
          <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-3)' }}>{empty}</div>
        ) : (
          subs.map((s, i) => {
            const origin = originMeta(s.origin);
            return (
              <div
                key={s.subId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '64px minmax(0, 1fr) auto',
                  gap: 12,
                  alignItems: 'center',
                  padding: '10px 16px',
                  borderBottom: i < subs.length - 1 ? '1px solid var(--border)' : 'none',
                  fontSize: 13,
                }}
              >
                <span style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtDay(s.signedAt)}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Link
                      href={`/closing/investor/${s.investorId}?from=${encodeURIComponent(backHref)}`}
                      style={{ fontWeight: 600, color: 'var(--text-1)' }}
                    >
                      {s.fullName}
                    </Link>
                    <span
                      className={`badge ${origin.badge}`}
                      style={{ fontSize: 10 }}
                      title={origin.hint}
                    >
                      {origin.label}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: muted ? 'var(--warning)' : 'var(--text-3)' }}>
                    {s.projectName ? `${s.projectName} · ` : ''}
                    {s.explanation}
                  </span>
                </div>
                <span
                  style={{
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                    color: muted ? 'var(--text-3)' : 'var(--text-1)',
                  }}
                >
                  {eur(s.amountEur)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
