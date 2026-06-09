import { CalendarClock, Phone } from 'lucide-react';
import Link from 'next/link';
import { getDueTasks, getTodayCallCount } from '@/lib/db/queries/closing';
import { TaskDoneButton } from './task-done-button';

export const dynamic = 'force-dynamic';

function fmtDue(d: Date): string {
  return new Date(d).toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function TodayPage() {
  const [tasks, callsToday] = await Promise.all([getDueTasks(), getTodayCallCount()]);
  const overdue = tasks.filter((t) => t.overdue).length;

  return (
    <>
      <div>
        <h1 className="page-title">Aujourd'hui</h1>
        <div className="page-desc">Tes rappels à passer et ton activité du jour.</div>
      </div>

      <div className="kpi-grid">
        <Kpi label="Rappels à passer" value={String(tasks.length)} accent="var(--brand)" />
        <Kpi label="En retard" value={String(overdue)} accent="var(--danger)" />
        <Kpi label="Appels passés aujourd'hui" value={String(callsToday)} accent="var(--success)" />
      </div>

      <div className="view-card">
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <CalendarClock size={15} />
            Rappels programmés
          </div>
          <span className="badge badge-neutral">{tasks.length}</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {tasks.length === 0 ? (
            <div style={{ padding: 24, fontSize: 13, color: 'var(--text-3)' }}>
              Aucun rappel à passer. 🎉 Tu peux attaquer la file d'appels.
            </div>
          ) : (
            tasks.map((t, idx) => (
              <div
                key={t.id}
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
                    {t.investorName ?? '—'}
                  </Link>
                  <span
                    style={{ fontSize: 11, color: t.overdue ? 'var(--danger)' : 'var(--text-4)' }}
                  >
                    {t.overdue ? '⏰ en retard · ' : ''}
                    {fmtDue(t.dueAt)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t.note ?? '—'}</div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  {t.investorPhone ? (
                    <a href={`tel:${t.investorPhone}`} className="btn btn-primary btn-sm">
                      <Phone size={13} />
                      Appeler
                    </a>
                  ) : null}
                  <TaskDoneButton taskId={t.id} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="view-card">
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: accent }}>{label}</span>
        <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}>{value}</span>
      </div>
    </div>
  );
}
