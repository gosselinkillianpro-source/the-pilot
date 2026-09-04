import { CalendarClock, Phone, PhoneOutgoing, Trophy, Wallet } from 'lucide-react';
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
import { resolvePortfolioPeriod } from '@/lib/closing/portfolio';
import { getPeriodExtras } from '@/lib/db/queries/closer-day';
import { listOwnerSubscriptions, type OwnerSubscription } from '@/lib/db/queries/portfolio';
import { resolveViewedCloser } from '@/lib/db/queries/viewed-closer';

/**
 * « Mes résultats » — ce que ça a rapporté (refonte du 4 sept. 2026).
 *
 * Une période, huit chiffres, la liste nominative des souscriptions créditées
 * avec la raison du crédit, celles qui ne le sont pas (pas de chiffre sans
 * explication), où l'on se situe dans l'équipe. Tout suit la période.
 */

export const dynamic = 'force-dynamic';

const BASE = '/closing/resultats';

const PERIOD_TABS: { key: 'semaine' | 'mois' | 'tout'; label: string }[] = [
  { key: 'semaine', label: 'Semaine' },
  { key: 'mois', label: 'Mois' },
  { key: 'tout', label: 'Tout' },
];

type Params = { closer?: string; periode?: string; du?: string; au?: string };

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

  const [board, subs, extras] = await Promise.all([
    getLeaderboardForPeriod(gamePeriod, now),
    listOwnerSubscriptions(viewed.viewedId),
    getPeriodExtras(viewed.viewedId, period.from, period.to),
  ]);

  const inPeriod = (d: Date) =>
    d.getTime() >= gamePeriod.from.getTime() && d.getTime() < gamePeriod.to.getTime();
  const credited = subs.filter((s) => s.credited && inPeriod(s.signedAt));
  const notCredited = subs.filter((s) => !s.credited && inPeriod(s.signedAt));
  const creditedEur = credited.reduce((t, s) => t + s.amountEur, 0);

  const entries = board.entries;
  const myIndex = entries.findIndex((e) => e.closerId === viewed.viewedId);
  const mine: LeaderboardEntry | undefined = myIndex >= 0 ? entries[myIndex] : undefined;

  const href = (over: Partial<Params>) => {
    const next: Params = { closer: sp.closer, periode: sp.periode, du: sp.du, au: sp.au, ...over };
    const p = new URLSearchParams();
    if (next.closer) p.set('closer', next.closer);
    if (next.periode && next.periode !== 'tout') p.set('periode', next.periode);
    if (next.du && next.au) {
      p.set('du', next.du);
      p.set('au', next.au);
    }
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
        params={{ periode: sp.periode, du: sp.du, au: sp.au }}
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
          <Stat label="souscriptions créditées" value={String(mine.subscriptions)} />
          <Stat
            icon={<Wallet size={14} />}
            label="collectés grâce à toi"
            value={eur(mine.amountEur)}
            accent="var(--brand)"
          />
          <Stat
            icon={<Trophy size={14} />}
            label={`#${myIndex + 1} sur ${entries.length} · ${mine.level.name}`}
            value={`${mine.xpPeriod.toLocaleString('fr-FR')} XP`}
            accent="var(--ai)"
          />
          <Stat label="clients pris sur la période" value={String(extras.clientsTaken)} />
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
            value={eur(creditedEur)}
            accent="var(--brand)"
          />
          <Stat label="clients pris sur la période" value={String(extras.clientsTaken)} />
          <Stat label="classement" value="hors compétition" />
        </div>
      )}

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
            subs={credited}
            total={creditedEur}
            backHref={backHref}
            empty="Aucune souscription créditée sur la période."
          />
          {notCredited.length > 0 ? (
            <SubsCard
              title="Souscriptions de tes clients non créditées"
              subs={notCredited}
              total={notCredited.reduce((t, s) => t + s.amountEur, 0)}
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
                      <span style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                        {e.xpPeriod.toLocaleString('fr-FR')} XP · {eur(e.amountEur)}
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
          subs.map((s, i) => (
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
                <Link
                  href={`/closing/investor/${s.investorId}?from=${encodeURIComponent(backHref)}`}
                  style={{ fontWeight: 600, color: 'var(--text-1)' }}
                >
                  {s.fullName}
                </Link>
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
          ))
        )}
      </div>
    </div>
  );
}
