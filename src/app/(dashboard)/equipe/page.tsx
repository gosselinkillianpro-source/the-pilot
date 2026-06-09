import { Activity } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth';
import { type ActivityEvent, type CloserStatus, getTeamOverview } from '@/lib/db/queries/team';
import { AutoRefresh } from './auto-refresh';

export const dynamic = 'force-dynamic';

function fmtAgo(d: Date | null): string {
  if (!d) return 'jamais';
  const ms = Date.now() - new Date(d).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

function fmtClock(d: Date): string {
  return new Date(d).toLocaleString('fr-FR', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function roleLabel(role: string): string {
  if (role === 'closer_junior') return 'Closer junior';
  if (role === 'closer') return 'Closer';
  if (role === 'admin') return 'Admin';
  return role;
}

export default async function EquipePage() {
  const user = await getAuthenticatedUser();
  if (user.role !== 'admin') notFound(); // page réservée à l'admin

  const { closers, feed } = await getTeamOverview();
  const onlineCount = closers.filter((c) => c.online).length;

  return (
    <>
      <AutoRefresh seconds={30} />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
        }}
      >
        <div>
          <h1 className="page-title">Équipe</h1>
          <div className="page-desc">
            Qui est en ligne, leur dernière action et l'activité en temps réel. Page réservée à
            l'admin · mise à jour automatique toutes les 30 s.
          </div>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {onlineCount}/{closers.length} en ligne
        </span>
      </div>

      {/* Cartes closers : présence + dernière action + activité du jour */}
      <div className="kpi-grid">
        {closers.length === 0 ? (
          <div className="view-card">
            <div
              className="view-card-body"
              style={{ padding: 20, fontSize: 13, color: 'var(--text-3)' }}
            >
              Aucun closer enregistré.
            </div>
          </div>
        ) : (
          closers.map((c) => <CloserCard key={c.id} c={c} />)
        )}
      </div>

      {/* Journal d'activité de l'équipe */}
      <div className="view-card">
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Activity size={15} />
            Activité récente
          </div>
          <span className="badge badge-neutral">{feed.length}</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {feed.length === 0 ? (
            <div style={{ padding: 24, fontSize: 13, color: 'var(--text-3)' }}>
              Aucune action enregistrée pour l'instant. Le journal se remplit dès que les closers
              passent des appels, qualifient ou planifient des actions.
            </div>
          ) : (
            feed.map((e, idx) => <FeedRow key={e.id} e={e} last={idx === feed.length - 1} />)
          )}
        </div>
      </div>
    </>
  );
}

function CloserCard({ c }: { c: CloserStatus }) {
  return (
    <div className="view-card">
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                flexShrink: 0,
                background: c.online ? 'var(--success)' : 'var(--text-4)',
                boxShadow: c.online ? '0 0 8px var(--success-glow)' : 'none',
              }}
            />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
              {c.name ?? '—'}
            </span>
          </span>
          <span className="badge badge-neutral" style={{ fontSize: 10 }}>
            {roleLabel(c.role)}
          </span>
        </div>

        <div style={{ fontSize: 12, color: c.online ? 'var(--success)' : 'var(--text-3)' }}>
          {c.online ? '🟢 En ligne' : `Vu ${fmtAgo(c.lastSeenAt)}`}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>Dernière action</span>
          {c.lastActionLabel ? (
            <span style={{ fontSize: 13, color: 'var(--text-1)' }}>
              {c.lastActionLabel}{' '}
              <span style={{ color: 'var(--text-4)', fontSize: 11 }}>
                · {fmtAgo(c.lastActionAt)}
              </span>
            </span>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}>—</span>
          )}
        </div>

        <div
          style={{ display: 'flex', gap: 20, paddingTop: 4, borderTop: '1px solid var(--border)' }}
        >
          <Stat label="Appels aujourd'hui" value={c.callsToday} />
          <Stat label="Actions aujourd'hui" value={c.actionsToday} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{value}</span>
      <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{label}</span>
    </div>
  );
}

function FeedRow({ e, last }: { e: ActivityEvent; last: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 20px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        alignItems: 'center',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: 13, color: 'var(--text-1)' }}>
          <strong>{e.actorName ?? 'Quelqu’un'}</strong> · {e.label}
        </span>
        {e.investorId ? (
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            <Link href={`/closing/investor/${e.investorId}`} style={{ color: 'var(--brand)' }}>
              {e.investorName ?? 'voir la fiche'}
            </Link>
          </div>
        ) : null}
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>
        {fmtClock(e.at)}
      </span>
    </div>
  );
}
