import {
  CalendarClock,
  CheckCircle2,
  Mail,
  MessageSquare,
  Phone,
  PhoneOutgoing,
} from 'lucide-react';
import Link from 'next/link';
import { getFollowUp } from '@/lib/db/queries/follow-up';
import { TaskDoneButton } from '../today/task-done-button';
import { QualifyCall } from './qualify-call';

export const dynamic = 'force-dynamic';

function fmtAgo(d: Date): string {
  const ms = Date.now() - new Date(d).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.floor(h / 24);
  return `il y a ${days} j`;
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

export default async function SuiviPage() {
  const { toQualify, callbacks, kpis } = await getFollowUp();

  return (
    <>
      <div>
        <h1 className="page-title">Suivi des appels</h1>
        <div className="page-desc">
          Les personnes que tu as appelées atterrissent ici. Renseigne le résultat de chaque appel
          et retrouve tes rappels à passer.
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi
          icon={<PhoneOutgoing size={15} />}
          label="Appelés (7 j)"
          value={String(kpis.calledLast7d)}
          accent="var(--brand)"
        />
        <Kpi
          icon={<CheckCircle2 size={15} />}
          label="À qualifier"
          value={String(kpis.toQualify)}
          accent="var(--warning)"
        />
        <Kpi
          icon={<CalendarClock size={15} />}
          label="Rappels à venir"
          value={String(kpis.callbacks)}
          accent="var(--ai)"
        />
        <Kpi
          icon={<CheckCircle2 size={15} />}
          label="Convertis (30 j)"
          value={String(kpis.conversions30d)}
          accent="var(--success)"
        />
      </div>

      {/* À QUALIFIER : appels passés sans résultat renseigné */}
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

      {/* RAPPELS & ACTIONS À VENIR */}
      <div className="view-card">
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <CalendarClock size={15} />
            Rappels & actions à venir
          </div>
          <span className="badge badge-neutral">{callbacks.length}</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {callbacks.length === 0 ? (
            <div style={{ padding: 24, fontSize: 13, color: 'var(--text-3)' }}>
              Aucun rappel programmé.
            </div>
          ) : (
            callbacks.map((t, idx) => {
              const meta = TASK_META[t.type] ?? TASK_META.todo;
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
                    borderBottom: idx < callbacks.length - 1 ? '1px solid var(--border)' : 'none',
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
                        color: t.overdue ? 'var(--danger)' : 'var(--text-4)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <span
                        className="badge badge-neutral"
                        style={{
                          fontSize: 10,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        {meta?.icon}
                        {meta?.label}
                      </span>
                      {t.overdue ? '⏰ en retard · ' : ''}
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
    </>
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
