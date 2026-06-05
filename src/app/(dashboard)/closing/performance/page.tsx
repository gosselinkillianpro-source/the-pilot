import { PeriodFilter } from '@/components/shared/period-filter';
import { StatCard } from '@/components/shared/stat-card';
import { getCloserPerformance } from '@/lib/db/queries/closing';
import { resolvePeriod } from '@/lib/period';

export const dynamic = 'force-dynamic';

function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

export default async function ClosingPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const period = resolvePeriod(await searchParams);
  const report = await getCloserPerformance(period);
  const attributedAmount = report.totalAmount - report.unattributed.amount;
  const callsCount = report.deltas.calls.current;
  const eurosPerCall = callsCount > 0 ? attributedAmount / callsCount : 0;

  return (
    <>
      <div>
        <h1 className="page-title">Performance closers</h1>
        <div className="page-desc">
          Activité d'appel et souscriptions attribuées (appel prime · last-touch · fenêtre 30j) sur
          la période {report.periodLabel}.
        </div>
      </div>

      <PeriodFilter />

      <div className="kpi-grid">
        <StatCard
          label="Appels (période)"
          value={String(report.deltas.calls.current)}
          delta={report.deltas.calls}
        />
        <StatCard
          label="Collecte signée (période)"
          value={money(report.deltas.collecte.current)}
          delta={report.deltas.collecte}
          unit="money"
        />
        <Kpi label="Souscriptions (période)" value={String(report.totalSubs)} />
        <Kpi label="Collecte attribuée aux appels" value={money(attributedAmount)} />
        <Kpi label="€ par appel (attribué)" value={money(eurosPerCall)} />
      </div>

      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Par closer</div>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 0.8fr 0.8fr 0.8fr 1fr 1.2fr',
              gap: 8,
              padding: '10px 20px',
              borderBottom: '1px solid var(--border)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-4)',
            }}
          >
            <span>Closer</span>
            <span style={{ textAlign: 'right' }}>Appels</span>
            <span style={{ textAlign: 'right' }}>Joints</span>
            <span style={{ textAlign: 'right' }}>Leads</span>
            <span style={{ textAlign: 'right' }}>Souscr. attr.</span>
            <span style={{ textAlign: 'right' }}>€ attribués</span>
          </div>
          {report.closers.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--text-3)' }}>
              Aucun closer enregistré (crée des comptes closer).
            </div>
          ) : (
            report.closers.map((c, idx) => (
              <div
                key={c.closerId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 0.8fr 0.8fr 0.8fr 1fr 1.2fr',
                  gap: 8,
                  padding: '12px 20px',
                  borderBottom:
                    idx < report.closers.length - 1 ? '1px solid var(--border)' : 'none',
                  fontSize: 13,
                  alignItems: 'center',
                }}
              >
                <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>
                  {c.name ?? c.closerId}
                  <span style={{ color: 'var(--text-4)', fontWeight: 400, fontSize: 11 }}>
                    {' '}
                    ({c.role})
                  </span>
                </span>
                <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>{c.calls}</span>
                <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>{c.reached}</span>
                <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>{c.assigned}</span>
                <span style={{ textAlign: 'right', color: 'var(--text-1)', fontWeight: 600 }}>
                  {c.attributedSubs}
                </span>
                <span style={{ textAlign: 'right', color: 'var(--text-1)', fontWeight: 600 }}>
                  {money(c.attributedAmount)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="view-card">
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>{value}</span>
      </div>
    </div>
  );
}
