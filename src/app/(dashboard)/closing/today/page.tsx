import {
  CalendarClock,
  CheckCircle2,
  KanbanSquare,
  Mail,
  MessageSquare,
  Phone,
  PhoneOutgoing,
} from 'lucide-react';
import Link from 'next/link';
import { getAuthenticatedUser } from '@/lib/auth';
import { getTodayCallCount } from '@/lib/db/queries/closing';
import { getFollowUp } from '@/lib/db/queries/follow-up';
import { QualifyCall } from '../suivi/qualify-call';
import { TaskDoneButton } from './task-done-button';

/**
 * Le cockpit du closer : une seule file, dans l'ordre où on la traite.
 *
 *   1. À qualifier   — ce que j'ai fait et qui attend mon retour
 *   2. À passer      — ce qui est dû maintenant (échéance ≤ aujourd'hui)
 *   3. À venir       — ce qui arrive après
 *
 * Fusionne /closing/today et /closing/suivi : les deux listaient les mêmes
 * `closer_tasks` avec le même bouton de complétion, l'une filtrée sur le jour,
 * l'autre non. Une tâche n'apparaît désormais que dans une seule section.
 */

export const dynamic = 'force-dynamic';

function fmtAgo(d: Date): string {
  const ms = Date.now() - new Date(d).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const TASK_META: Record<string, { label: string; icon: React.ReactNode }> = {
  callback: { label: 'Rappel', icon: <Phone size={13} /> },
  email: { label: 'Email', icon: <Mail size={13} /> },
  message: { label: 'Message', icon: <MessageSquare size={13} /> },
  todo: { label: 'Tâche', icon: <CheckCircle2 size={13} /> },
};

type Callback = Awaited<ReturnType<typeof getFollowUp>>['callbacks'][number];

export default async function TodayPage() {
  // Chaque closer voit SON cockpit : ses leads attitrés à qualifier, ses
  // rappels, ses appels du jour. Sans ce filtre, les 4 closers voyaient la
  // même liste et se marchaient dessus (« c'est à qui, ce rappel ? »).
  // L'admin et la direction gardent la vue d'ensemble.
  const user = await getAuthenticatedUser();
  const isCloser = user.role === 'closer' || user.role === 'closer_junior';
  const scope = isCloser ? { closerId: user.id } : undefined;
  const [{ toQualify, callbacks, kpis }, callsToday] = await Promise.all([
    getFollowUp(scope),
    getTodayCallCount(scope),
  ]);

  // `callbacks` contient TOUTES les tâches en attente. On coupe en deux au
  // seuil « fin de journée » pour ne jamais afficher la même tâche deux fois.
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const due: Callback[] = [];
  const upcoming: Callback[] = [];
  for (const t of callbacks) {
    (new Date(t.dueAt) <= endOfToday ? due : upcoming).push(t);
  }
  const overdue = due.filter((t) => t.overdue).length;

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
          <h1 className="page-title">Aujourd'hui</h1>
          <div className="page-desc">
            Ce qui attend ton retour, ce qu'il faut faire maintenant, et ce qui arrive.
          </div>
        </div>
        {/* Une fois l'appel qualifié, la personne part ici : le lien évite de
            chercher où elle est passée. */}
        <Link href="/closing/pipeline" className="btn btn-secondary btn-sm">
          <KanbanSquare size={13} />
          Suivi des appels
        </Link>
      </div>

      <div className="kpi-grid">
        <Kpi
          icon={<CheckCircle2 size={15} />}
          label="À qualifier"
          value={String(toQualify.length)}
          accent="var(--warning)"
        />
        <Kpi
          icon={<CalendarClock size={15} />}
          label="Rappels à passer"
          value={String(due.length)}
          accent="var(--brand)"
        />
        <Kpi
          icon={<CalendarClock size={15} />}
          label="En retard"
          value={String(overdue)}
          accent="var(--danger)"
        />
        <Kpi
          icon={<PhoneOutgoing size={15} />}
          label="Appels aujourd'hui"
          value={String(callsToday)}
          accent="var(--success)"
        />
        <Kpi
          icon={<CheckCircle2 size={15} />}
          label="Convertis (30 j)"
          value={String(kpis.conversions30d)}
          accent="var(--ai)"
        />
      </div>

      {/* 1. À QUALIFIER — appels passés dont le résultat n'est pas renseigné */}
      <div className="view-card">
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <CheckCircle2 size={15} />À qualifier — comment s'est passé l'appel ?
          </div>
          <span className="badge badge-neutral">{toQualify.length}</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {toQualify.length === 0 ? (
            <div style={{ padding: 24, fontSize: 13, color: 'var(--text-3)' }}>
              Rien à qualifier. 🎉 Tous tes appels récents ont un résultat.
            </div>
          ) : (
            toQualify.map((r, idx) => (
              <div
                key={r.callId}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: '14px 20px',
                  borderBottom: idx < toQualify.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <Link
                      href={`/closing/investor/${r.investorId}`}
                      style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}
                    >
                      {r.fullName ?? '—'}
                    </Link>
                    <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
                      Appelé {fmtAgo(r.calledAt)} · {fmtDateTime(r.calledAt)}
                      {r.assignedCloserName ? ` · suivi : ${r.assignedCloserName}` : ''}
                    </span>
                  </div>
                  {r.phone ? (
                    <a href={`tel:${r.phone}`} className="btn btn-secondary btn-sm">
                      <Phone size={13} />
                      Rappeler
                    </a>
                  ) : null}
                </div>
                <QualifyCall callId={r.callId} name={r.fullName ?? 'cette personne'} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* 2. À PASSER MAINTENANT */}
      <TaskList
        title="Rappels à passer"
        emptyLabel="Aucun rappel dû aujourd'hui."
        tasks={due}
        highlightOverdue
      />

      {/* 3. À VENIR */}
      <TaskList title="À venir" emptyLabel="Rien de programmé pour la suite." tasks={upcoming} />
    </>
  );
}

function TaskList({
  title,
  emptyLabel,
  tasks,
  highlightOverdue = false,
}: {
  title: string;
  emptyLabel: string;
  tasks: Callback[];
  highlightOverdue?: boolean;
}) {
  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalendarClock size={15} />
          {title}
        </div>
        <span className="badge badge-neutral">{tasks.length}</span>
      </div>
      <div className="view-card-body" style={{ padding: 0 }}>
        {tasks.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: 'var(--text-3)' }}>{emptyLabel}</div>
        ) : (
          tasks.map((t, idx) => {
            const meta = TASK_META[t.type] ?? TASK_META.todo;
            const late = highlightOverdue && t.overdue;
            return (
              <div
                key={t.taskId}
                className="r-stack"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 1.4fr 150px',
                  gap: 12,
                  alignItems: 'center',
                  padding: '12px 20px',
                  borderBottom: idx < tasks.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <Link
                    href={`/closing/investor/${t.investorId}`}
                    style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}
                  >
                    {t.fullName ?? '—'}
                  </Link>
                  <span
                    style={{
                      fontSize: 11,
                      color: late ? 'var(--danger)' : 'var(--text-4)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <span
                      className="badge badge-neutral"
                      style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                    >
                      {meta?.icon}
                      {meta?.label}
                    </span>
                    {late ? '⏰ en retard · ' : ''}
                    {fmtDateTime(t.dueAt)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t.note ?? '—'}</div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  {t.phone ? (
                    <a href={`tel:${t.phone}`} className="btn btn-primary btn-sm">
                      <Phone size={13} />
                    </a>
                  ) : null}
                  <TaskDoneButton taskId={t.taskId} label={t.fullName ?? undefined} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="view-card">
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: accent, fontSize: 12 }}
        >
          {icon}
          {label}
        </span>
        <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}>{value}</span>
      </div>
    </div>
  );
}
