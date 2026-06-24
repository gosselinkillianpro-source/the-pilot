import { AlertTriangle, Network, PhoneCall } from 'lucide-react';
import { getAuthenticatedUser } from '@/lib/auth';
import { getAffiliateOverview, getAffiliateSahId } from '@/lib/db/queries/affiliate';
import { getCallQueue } from '@/lib/db/queries/call-queue';

export const dynamic = 'force-dynamic';

function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

const TEMP_COLOR: Record<string, string> = {
  hot: 'var(--danger, #c0392b)',
  warm: 'var(--warning, #d97706)',
  cold: 'var(--text-3)',
};

export default async function ReseauPage() {
  const user = await getAuthenticatedUser();
  const sahId = await getAffiliateSahId(user.id);

  if (!sahId) {
    return (
      <>
        <h1 className="page-title">Mon réseau</h1>
        <div className="alert alert-warning" style={{ marginTop: 12 }}>
          <span className="alert-icon">
            <AlertTriangle size={16} />
          </span>
          <div className="alert-body">
            <div className="alert-title">Compte non relié à un réseau</div>
            <div className="alert-description">
              Ce compte n'est pas encore lié à une personne SAH (sah_user_id). Un administrateur
              doit le relier à ton code d'affiliation pour afficher ton réseau.
            </div>
          </div>
        </div>
      </>
    );
  }

  const [overview, queue] = await Promise.all([
    getAffiliateOverview(sahId),
    getCallQueue({ ownerSahId: sahId, excludeWon: true }),
  ]);

  return (
    <>
      <div>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Network size={20} style={{ color: 'var(--ai)' }} />
          Mon réseau
        </h1>
        <div className="page-desc">
          Tes filleuls et leur activité · qui rappeler en priorité, par ordre d'urgence.
        </div>
      </div>

      {/* Vue d'ensemble */}
      <div className="kpi-grid">
        <Kpi label="Membres du réseau" value={String(overview.totalMembers)} />
        <Kpi label="Onboardés" value={String(overview.totalOnboarded)} />
        <Kpi
          label="Collecte du réseau"
          value={money(overview.totalInvested)}
          accent="var(--success)"
        />
        <Kpi label="À rappeler" value={String(queue.length)} accent="var(--brand)" />
      </div>

      {/* Par niveau */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Par niveau</div>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {overview.byLevel.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--text-3)' }}>
              Aucun filleul pour l'instant.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <Row cells={['Niveau', 'Membres', 'Onboardés', 'Collecte']} head />
              {overview.byLevel.map((l) => (
                <Row
                  key={l.depth}
                  cells={[l.label, String(l.members), String(l.onboarded), money(l.invested)]}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Liste de rappel (scoring IA) */}
      <div className="view-card">
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <PhoneCall size={15} />À rappeler — par priorité
          </div>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {queue.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--text-3)' }}>
              Personne à rappeler pour l'instant.
            </div>
          ) : (
            queue.map((q, idx) => (
              <div
                key={q.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '12px 16px',
                  borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                    {q.fullName ?? '(sans nom)'}
                    {q.city ? <span style={{ color: 'var(--text-4)' }}> · {q.city}</span> : null}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: TEMP_COLOR[q.scored.temperature] ?? 'var(--text-3)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {q.scored.temperatureLabel} · {q.scored.priority}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {q.scored.queueLabel} · {q.scored.statusLabel}
                  {q.phone ? <span style={{ color: 'var(--text-4)' }}> · {q.phone}</span> : null}
                </div>
                {q.scored.callGoal ? (
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>🎯 {q.scored.callGoal}</div>
                ) : null}
                {q.scored.factors.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                    {q.scored.factors.map((f) => (
                      <span key={f} className="badge badge-neutral" style={{ fontSize: 11 }}>
                        {f}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="view-card">
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: accent ?? 'var(--text-3)' }}>{label}</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>{value}</span>
      </div>
    </div>
  );
}

function Row({ cells, head }: { cells: string[]; head?: boolean }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1fr 1fr',
        gap: 8,
        padding: head ? '8px 16px' : '10px 16px',
        borderBottom: '1px solid var(--border)',
        fontSize: head ? 10 : 12,
        textTransform: head ? 'uppercase' : 'none',
        letterSpacing: head ? '0.05em' : undefined,
        color: head ? 'var(--text-4)' : 'var(--text-2)',
      }}
    >
      {cells.map((c, i) => (
        <span
          key={c}
          style={{
            textAlign: i === 0 ? 'left' : 'right',
            color: !head && i === 0 ? 'var(--text-1)' : undefined,
            fontWeight: !head && i === 0 ? 600 : undefined,
          }}
        >
          {c}
        </span>
      ))}
    </div>
  );
}
