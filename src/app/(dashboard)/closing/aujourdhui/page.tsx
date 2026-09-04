import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Hand,
  Phone,
  PhoneOutgoing,
  PlayCircle,
  Sparkles,
  Trophy,
  UserSquare2,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ClaimControl } from '@/components/closing/claim-control';
import { CloserPicker } from '@/components/closing/closer-picker';
import { getAuthenticatedUser } from '@/lib/auth';
import { DAILY_CALL_GOAL, goalProgressPct } from '@/lib/closing/day';
import { activityLabel, eur, fmtAgo, fmtDateTime, fmtTime, taskLabel } from '@/lib/closing/format';
import { groupPool, type PoolGroup } from '@/lib/closing/pool';
import { relationshipStateMeta } from '@/lib/closing/relationship-state';
import type { QueueRow } from '@/lib/db/queries/call-queue';
import { type ClientRow, type CloserDay, getCloserDay } from '@/lib/db/queries/closer-day';
import type { CallbackRow } from '@/lib/db/queries/follow-up';
import { resolveViewedCloser } from '@/lib/db/queries/viewed-closer';
import { QualifyCall } from '../suivi/qualify-call';
import { TaskDoneButton } from '../today/task-done-button';

/**
 * « Aujourd'hui » — le poste de travail du closer (refonte du 4 sept. 2026).
 *
 * En haut : où j'en suis, en trois secondes. À gauche : ce que le système a
 * préparé, dans l'ordre (réservés, en retard, maintenant, à qualifier, plus
 * tard, à planifier). À droite : le pool commun (pubs d'abord) et où je me
 * situe. Le closer ne filtre rien ; il prend, il appelle, il enregistre.
 */

export const dynamic = 'force-dynamic';

const BACK = '/closing/aujourdhui';

export default async function AujourdhuiPage({
  searchParams,
}: {
  searchParams: Promise<{ closer?: string }>;
}) {
  const [sp, user] = await Promise.all([searchParams, getAuthenticatedUser()]);
  const viewed = await resolveViewedCloser(user, sp.closer);
  const day = await getCloserDay(viewed.viewedId);
  const canAct = user.role !== 'executive';
  const groups = groupPool(day.pool);
  const urgentGroups = groups.filter((g) => g.urgent);
  const baseGroups = groups.filter((g) => !g.urgent);
  const urgent = urgentGroups.reduce((n, g) => n + g.rows.length, 0);
  const todo =
    day.reserved.length +
    day.tasks.overdue.length +
    day.tasks.dueToday.length +
    day.toQualify.length +
    day.tasks.laterToday.length;

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
          <h1 className="page-title">
            {viewed.isMine ? "Aujourd'hui" : `Aujourd'hui — ${viewed.viewedName ?? 'ce closer'}`}
          </h1>
          <div className="page-desc">
            {fmtDateTime(day.now)} · {todo} action{todo > 1 ? 's' : ''} à faire ·{' '}
            {day.tasks.upcoming.length} à venir
          </div>
        </div>
        {canAct && viewed.isMine ? (
          <Link href="/closing/session" className="btn btn-primary">
            <PlayCircle size={15} />
            Lancer les appels
          </Link>
        ) : null}
      </div>

      <CloserPicker viewed={viewed} basePath={BACK} params={{}} />

      <StatsStrip day={day} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* ---------- Colonne principale : à faire maintenant ---------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {day.reserved.length > 0 && (
            <Section
              icon={<Hand size={15} />}
              title="Réservés — à appeler maintenant"
              count={day.reserved.length}
              hint="Pris dans le pool. Sans résultat enregistré dans les 30 minutes, ils y retournent."
            >
              {day.reserved.map((r, i) => (
                <PersonRow
                  key={r.id}
                  row={r}
                  last={i === day.reserved.length - 1}
                  when={r.claimedAt ? `réservé ${fmtAgo(r.claimedAt, day.now)}` : 'réservé'}
                  why={r.scored.callGoal}
                  canAct={canAct}
                  myId={user.id}
                />
              ))}
            </Section>
          )}

          <Section
            icon={<AlertTriangle size={15} />}
            title="En retard"
            count={day.tasks.overdue.length}
            tone="danger"
            empty="Rien en retard. 👌"
          >
            {day.tasks.overdue.map((t, i) => (
              <TaskRow
                key={t.taskId}
                task={t}
                late
                last={i === day.tasks.overdue.length - 1}
                now={day.now}
                canAct={canAct}
              />
            ))}
          </Section>

          <Section
            icon={<Clock size={15} />}
            title="Maintenant"
            count={day.tasks.dueToday.length}
            empty="Rien de dû dans l'heure."
          >
            {day.tasks.dueToday.map((t, i) => (
              <TaskRow
                key={t.taskId}
                task={t}
                last={i === day.tasks.dueToday.length - 1}
                now={day.now}
                canAct={canAct}
              />
            ))}
          </Section>

          {day.toQualify.length > 0 && (
            <Section
              icon={<CheckCircle2 size={15} />}
              title="À qualifier — comment s'est passé l'appel ?"
              count={day.toQualify.length}
              hint="Appels enregistrés sans résultat (ancien bouton « Appelé »)."
            >
              {day.toQualify.map((r, i) => (
                <div
                  key={r.callId}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: '12px 16px',
                    borderBottom: i < day.toQualify.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Link
                        href={`/closing/investor/${r.investorId}?from=${encodeURIComponent(BACK)}`}
                        style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}
                      >
                        {r.fullName ?? '—'}
                      </Link>
                      <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
                        Appelé {fmtAgo(r.calledAt, day.now)} · {fmtDateTime(r.calledAt)}
                      </span>
                    </div>
                    {r.phone ? (
                      <a href={`tel:${r.phone}`} className="btn btn-secondary btn-sm">
                        <Phone size={13} />
                        Rappeler
                      </a>
                    ) : null}
                  </div>
                  {canAct ? (
                    <QualifyCall callId={r.callId} name={r.fullName ?? 'cette personne'} />
                  ) : null}
                </div>
              ))}
            </Section>
          )}

          <Section
            icon={<CalendarClock size={15} />}
            title="Plus tard aujourd'hui"
            count={day.tasks.laterToday.length}
            empty="Rien d'autre aujourd'hui."
          >
            {day.tasks.laterToday.map((t, i) => (
              <TaskRow
                key={t.taskId}
                task={t}
                last={i === day.tasks.laterToday.length - 1}
                now={day.now}
                canAct={canAct}
              />
            ))}
          </Section>

          {day.toPlan.length > 0 && (
            <Section
              icon={<Sparkles size={15} />}
              title="À planifier — tes clients sans prochaine action"
              count={day.toPlan.length}
              hint="Un appel avec sa suite, et ils sortent d'ici. Les plus récents d'abord."
            >
              {day.toPlan.slice(0, 20).map((c, i) => (
                <PersonRow
                  key={c.id}
                  row={c}
                  last={i === Math.min(day.toPlan.length, 20) - 1}
                  when={
                    c.lastActivity?.at
                      ? `${activityLabel(c.lastActivity)} ${fmtAgo(c.lastActivity.at, day.now)}`
                      : 'jamais contacté'
                  }
                  why={[c.mission.label, ...c.scored.factors].join(' · ')}
                  state={c}
                  canAct={canAct}
                  myId={user.id}
                />
              ))}
            </Section>
          )}
        </div>

        {/* ---------- Colonne droite : le pool, mes clients, la semaine ---------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Section
            icon={<PhoneOutgoing size={15} />}
            title="À prendre dans le pool"
            count={urgent}
            hint="Personnes que personne ne suit encore, par raison d’appel. « Je prends » réserve 30 minutes ; le premier résultat enregistré rend la personne à toi."
          >
            {urgentGroups.length === 0 ? (
              <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-3)' }}>
                Rien de nouveau ni d'urgent : on passe à la base.
              </div>
            ) : null}
            {urgentGroups.map((g) => (
              <PoolGroupBlock key={g.key} group={g} canAct={canAct} myId={user.id} limit={6} />
            ))}
            {baseGroups.map((g, i) => (
              <PoolGroupBlock
                key={g.key}
                group={g}
                canAct={canAct}
                myId={user.id}
                limit={5}
                collapsed={urgent > 0 || i > 0}
              />
            ))}
          </Section>

          <ClientsSummary day={day} />

          <WeekPanel day={day} />
        </div>
      </div>
    </>
  );
}

/* ============================================================
   Bandeau « où j'en suis »
   ============================================================ */

function StatsStrip({ day }: { day: CloserDay }) {
  const s = day.stats;
  const pct = goalProgressPct(s.calls);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="kpi-grid">
        <Stat icon={<PhoneOutgoing size={14} />} label="appels" value={String(s.calls)} />
        <Stat
          icon={<Phone size={14} />}
          label="joints"
          value={String(s.reached)}
          accent="var(--success)"
        />
        <Stat icon={<CalendarClock size={14} />} label="RDV pris" value={String(s.meetings)} />
        <Stat
          icon={<Wallet size={14} />}
          label="collecté aujourd'hui"
          value={eur(s.collectedTodayEur)}
          accent="var(--brand)"
        />
        <Stat
          icon={<Trophy size={14} />}
          label={
            s.rankWeek != null
              ? `#${s.rankWeek} sur ${s.rankedCount} cette semaine`
              : 'cette semaine'
          }
          value={s.xpWeek != null ? `${s.xpWeek.toLocaleString('fr-FR')} XP` : 'hors classement'}
          accent="var(--ai)"
        />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 12,
          color: 'var(--text-2)',
        }}
      >
        <span>Objectif du jour</span>
        <div
          style={{
            flex: 1,
            height: 8,
            borderRadius: 999,
            background: 'var(--surface-3)',
            overflow: 'hidden',
          }}
          role="progressbar"
          aria-label="Objectif du jour"
          aria-valuemin={0}
          aria-valuemax={DAILY_CALL_GOAL}
          aria-valuenow={Math.min(s.calls, DAILY_CALL_GOAL)}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: 'var(--brand)',
              borderRadius: 999,
            }}
          />
        </div>
        <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
          {s.calls} / {DAILY_CALL_GOAL} appels
        </span>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent = 'var(--text-3)',
}: {
  icon: ReactNode;
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

/* ============================================================
   Sections et lignes
   ============================================================ */

function Section({
  icon,
  title,
  count,
  hint,
  empty,
  tone,
  children,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  hint?: string;
  empty?: string;
  tone?: 'danger';
  children: ReactNode;
}) {
  return (
    <div className="view-card">
      <div className="view-card-header" style={{ alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div
            className="view-card-title"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: tone === 'danger' && count > 0 ? 'var(--danger)' : undefined,
            }}
          >
            {icon}
            {title}
          </div>
          {hint ? <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{hint}</span> : null}
        </div>
        <span
          className={`badge ${tone === 'danger' && count > 0 ? 'badge-danger' : 'badge-neutral'}`}
        >
          {count}
        </span>
      </div>
      <div className="view-card-body" style={{ padding: 0 }}>
        {count === 0 && empty ? (
          <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-3)' }}>{empty}</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function ResultLink({ investorId }: { investorId: string }) {
  return (
    <Link
      href={`/closing/session?lead=${investorId}&from=${encodeURIComponent(BACK)}`}
      className="btn btn-secondary btn-sm"
      title="Enregistrer le résultat et la suite"
    >
      Résultat
    </Link>
  );
}

function TaskRow({
  task,
  late = false,
  last,
  now,
  canAct,
}: {
  task: CallbackRow;
  late?: boolean;
  last: boolean;
  now: Date;
  canAct: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '64px minmax(0, 1fr) auto',
        gap: 12,
        alignItems: 'center',
        padding: '10px 16px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: late ? 700 : 500,
          color: late ? 'var(--danger)' : 'var(--text-3)',
          fontVariantNumeric: 'tabular-nums',
        }}
        title={fmtDateTime(task.dueAt)}
      >
        {late ? fmtAgo(task.dueAt, now).replace('il y a', '−') : fmtTime(task.dueAt)}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <Link
          href={`/closing/investor/${task.investorId}?from=${encodeURIComponent(BACK)}`}
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}
        >
          {task.fullName ?? '—'}
        </Link>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          <span className="badge badge-neutral" style={{ fontSize: 10, marginRight: 6 }}>
            {taskLabel(task.type)}
          </span>
          {task.note ?? ''}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {task.phone ? (
          <a href={`tel:${task.phone}`} className="btn btn-primary btn-sm" aria-label="Appeler">
            <Phone size={13} />
          </a>
        ) : null}
        {canAct ? (
          <>
            <ResultLink investorId={task.investorId} />
            <TaskDoneButton taskId={task.taskId} label={task.fullName ?? undefined} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function PersonRow({
  row,
  last,
  when,
  why,
  state,
  canAct,
  myId,
}: {
  row: QueueRow;
  last: boolean;
  when: string;
  why: string;
  state?: ClientRow;
  canAct: boolean;
  myId: string;
}) {
  const meta = state ? relationshipStateMeta(state.state) : null;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 12,
        alignItems: 'center',
        padding: '10px 16px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link
            href={`/closing/investor/${row.id}?from=${encodeURIComponent(BACK)}`}
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}
          >
            {row.fullName ?? row.email}
          </Link>
          {meta ? (
            <span className={`badge ${meta.badge}`} style={{ fontSize: 10 }}>
              {meta.label}
            </span>
          ) : null}
          {row.isBreach ? (
            <span className="badge badge-ai" style={{ fontSize: 10 }}>
              pub
            </span>
          ) : null}
          {row.city ? (
            <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{row.city}</span>
          ) : null}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {why} · {when}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {row.phone ? (
          <a href={`tel:${row.phone}`} className="btn btn-primary btn-sm" aria-label="Appeler">
            <Phone size={13} />
          </a>
        ) : null}
        {canAct ? <ResultLink investorId={row.id} /> : null}
        {canAct && row.claimedById === myId ? (
          <ClaimControl investorId={row.id} claimedByMe />
        ) : null}
      </div>
    </div>
  );
}

function PoolGroupBlock({
  group,
  canAct,
  myId,
  limit,
  collapsed = false,
}: {
  group: PoolGroup<QueueRow>;
  canAct: boolean;
  myId: string;
  limit: number;
  collapsed?: boolean;
}) {
  const shown = collapsed ? [] : group.rows.slice(0, limit);
  const hidden = group.rows.length - shown.length;
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div
        style={{
          padding: '8px 16px',
          background: 'var(--surface-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--text-1)',
          }}
        >
          {group.label}
          <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 12 }}>
            {group.rows.length}
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{group.hint}</span>
      </div>
      {collapsed ? (
        <div style={{ padding: '6px 16px', fontSize: 11, color: 'var(--text-4)' }}>
          Proposé quand il n'y a plus rien de plus urgent.
        </div>
      ) : (
        shown.map((r, i) => {
          const byOther = r.claimedById != null && r.claimedById !== myId;
          const byMe = r.claimedById === myId;
          const why = [
            ...r.scored.factors,
            r.city,
            r.phone ? null : 'sans téléphone',
            byOther ? `réservé par ${r.claimerName ?? 'un collègue'}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <div
              key={r.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 10,
                alignItems: 'center',
                padding: '8px 16px',
                borderBottom:
                  i < shown.length - 1 || hidden > 0 ? '1px solid var(--border)' : 'none',
                opacity: byOther ? 0.55 : 1,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <Link
                  href={`/closing/investor/${r.id}?from=${encodeURIComponent(BACK)}`}
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.fullName ?? r.email}
                </Link>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{why}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {canAct && !byOther ? <ClaimControl investorId={r.id} claimedByMe={byMe} /> : null}
              </div>
            </div>
          );
        })
      )}
      {!collapsed && hidden > 0 ? (
        <div style={{ padding: '6px 16px', fontSize: 11, color: 'var(--text-4)' }}>
          + {hidden} autre{hidden > 1 ? 's' : ''} pour la même raison
        </div>
      ) : null}
    </div>
  );
}

function ClientsSummary({ day }: { day: CloserDay }) {
  const count = (k: string) => day.clients.filter((c) => c.state === k).length;
  const soonRepay = day.clients.filter(
    (c) => c.scored.nearestRepaymentDays != null && c.scored.nearestRepaymentDays <= 30,
  ).length;
  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UserSquare2 size={15} />
          Mes clients
        </div>
        <Link href="/closing/clients" className="btn btn-ghost btn-sm">
          {day.clients.length} · voir
        </Link>
      </div>
      <div className="view-card-body" style={{ padding: 0 }}>
        <SummaryLine
          label="Prêts à investir"
          hint="KYC ok, jamais investi"
          value={count('ready')}
        />
        <SummaryLine label="En discussion" value={count('talking')} />
        <SummaryLine label="À contacter" value={count('to_contact')} />
        <SummaryLine
          label="Remboursements sous 30 jours"
          hint="à proposer un réinvest"
          value={soonRepay}
        />
        <SummaryLine label="Clients" hint="ont investi" value={count('client')} last />
      </div>
    </div>
  );
}

function SummaryLine({
  label,
  hint,
  value,
  last = false,
}: {
  label: string;
  hint?: string;
  value: number;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 16px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        fontSize: 12.5,
      }}
    >
      <span>
        {label}
        {hint ? (
          <span style={{ color: 'var(--text-4)', display: 'block', fontSize: 11 }}>{hint}</span>
        ) : null}
      </span>
      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function WeekPanel({ day }: { day: CloserDay }) {
  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Trophy size={15} />
          Cette semaine
        </div>
        <Link href="/closing/resultats" className="btn btn-ghost btn-sm">
          Mes résultats
        </Link>
      </div>
      <div className="view-card-body" style={{ padding: '8px 16px', fontSize: 12.5 }}>
        {day.weekTop.length === 0 ? (
          <span style={{ color: 'var(--text-4)' }}>Pas encore de classement.</span>
        ) : (
          day.weekTop.map((e, i) => (
            <div
              key={e.closerId}
              style={{
                display: 'grid',
                gridTemplateColumns: '24px 1fr auto',
                gap: 8,
                padding: '4px 0',
              }}
            >
              <span>{['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`}</span>
              <span style={{ fontWeight: 500 }}>{e.name ?? 'Closer'}</span>
              <span style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                {e.xpPeriod.toLocaleString('fr-FR')} XP · {eur(e.amountEur)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
