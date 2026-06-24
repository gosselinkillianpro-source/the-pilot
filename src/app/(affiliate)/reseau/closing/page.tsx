import { Phone, PhoneCall } from 'lucide-react';
import Link from 'next/link';
import { Empty, Kpi, NotLinked } from '@/components/affiliate/ui';
import { resolveAffiliateScope } from '@/lib/db/queries/affiliate';
import { getCallQueue } from '@/lib/db/queries/call-queue';

export const dynamic = 'force-dynamic';

const TEMP_COLOR: Record<string, string> = {
  hot: 'var(--danger, #c0392b)',
  warm: 'var(--warning, #d97706)',
  cold: 'var(--text-3)',
};

export default async function ClosingPage() {
  const scope = await resolveAffiliateScope();
  if (!scope) return <NotLinked title="Closing" />;
  const queue = await getCallQueue({ ownerSahId: scope.sahId, excludeWon: true });

  const hot = queue.filter((q) => q.scored.temperature === 'hot').length;

  return (
    <>
      <div>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PhoneCall size={20} style={{ color: 'var(--ai)' }} />
          Closing — qui rappeler
        </h1>
        <div className="page-desc">
          Ton réseau trié par priorité d'appel (scoring IA). Clique sur un membre pour sa fiche.
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi label="À rappeler" value={String(queue.length)} />
        <Kpi label="Chauds (prioritaires)" value={String(hot)} accent="var(--danger, #c0392b)" />
      </div>

      <div className="view-card">
        <div className="view-card-body" style={{ padding: 0 }}>
          {queue.length === 0 ? (
            <Empty label="Personne à rappeler pour l'instant." />
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
                  <Link
                    href={`/reseau/investisseur/${q.id}`}
                    style={{ fontWeight: 600, color: 'var(--text-1)', flex: 1, minWidth: 0 }}
                  >
                    {q.fullName ?? '(sans nom)'}
                    {q.city ? <span style={{ color: 'var(--text-4)' }}> · {q.city}</span> : null}
                  </Link>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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
                    {q.phone ? (
                      <a
                        href={`tel:${q.phone}`}
                        title={`Appeler ${q.phone}`}
                        className="btn btn-primary btn-sm"
                        style={{ padding: '4px 8px' }}
                      >
                        <Phone size={13} />
                      </a>
                    ) : null}
                  </div>
                </div>
                <Link
                  href={`/reseau/investisseur/${q.id}`}
                  style={{ display: 'block', color: 'inherit' }}
                >
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {q.scored.queueLabel} · {q.scored.statusLabel}
                    {q.phone ? <span style={{ color: 'var(--text-4)' }}> · {q.phone}</span> : null}
                    {q.walletBalanceCents != null && q.walletBalanceCents >= 10000 ? (
                      <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                        {' '}
                        · 💰 {Math.round(q.walletBalanceCents / 100).toLocaleString('fr-FR')} €
                        dispo
                      </span>
                    ) : null}
                  </div>
                  {q.scored.callGoal ? (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                      🎯 {q.scored.callGoal}
                    </div>
                  ) : null}
                </Link>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
