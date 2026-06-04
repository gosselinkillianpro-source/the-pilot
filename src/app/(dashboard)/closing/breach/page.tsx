import { Target } from 'lucide-react';
import { getBreachStats } from '@/lib/db/queries/closing';

export const dynamic = 'force-dynamic';

function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}
function pct(n: number, d: number): string {
  if (d <= 0) return '—';
  return `${Math.round((n / d) * 100)} %`;
}

export default async function BreachPage() {
  const stats = await getBreachStats();
  const f = stats.funnel;

  // Taux d'onboarding comparé (BREACH vs reste) pour juger la qualité des pubs.
  const breachRate = f.total > 0 ? f.onboarded / f.total : 0;
  const otherRate = stats.otherTotal > 0 ? stats.otherOnboarded / stats.otherTotal : 0;

  const steps = [
    { label: 'Inscrits', value: f.total },
    { label: 'Profil complété', value: f.registered },
    { label: 'Onboardés (KYC)', value: f.onboarded },
    { label: 'Investisseurs', value: f.investors },
  ];

  return (
    <>
      <div>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Target size={20} style={{ color: 'var(--ai)' }} />
          BREACH — mes leads
        </h1>
        <div className="page-desc">
          Toutes les personnes venues de tes pubs (code bonus contenant « BREACH »). Du clic à la
          souscription.
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Kpi label="Leads BREACH" value={String(f.total)} />
        <Kpi label="Onboardés" value={`${f.onboarded} · ${pct(f.onboarded, f.total)}`} />
        <Kpi label="Investisseurs" value={String(f.investors)} />
        <Kpi label="Collecte BREACH" value={money(stats.totalInvested)} accent="var(--success)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <Kpi label="Nouveaux (7 jours)" value={String(f.new7d)} accent="var(--brand)" />
        <Kpi label="Nouveaux (30 jours)" value={String(f.new30d)} accent="var(--brand)" />
      </div>

      {/* Funnel */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Funnel BREACH</div>
        </div>
        <div
          className="view-card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {steps.map((st) => {
            const width = f.total > 0 ? Math.max(4, (st.value / f.total) * 100) : 0;
            return (
              <div key={st.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-2)' }}>{st.label}</span>
                  <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>
                    {st.value}{' '}
                    <span style={{ color: 'var(--text-4)' }}>({pct(st.value, f.total)})</span>
                  </span>
                </div>
                <div style={{ height: 8, background: 'var(--glass-bg)', borderRadius: 4 }}>
                  <div
                    style={{
                      width: `${width}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg,#2563EB,#7C3AED)',
                      borderRadius: 4,
                    }}
                  />
                </div>
              </div>
            );
          })}
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '6px 0 0' }}>
            Taux d'onboarding BREACH : <strong>{pct(f.onboarded, f.total)}</strong> vs hors BREACH :{' '}
            <strong>{pct(stats.otherOnboarded, stats.otherTotal)}</strong>{' '}
            {breachRate >= otherRate ? '✅ tes pubs convertissent mieux' : '⚠️ en dessous du reste'}.
          </p>
        </div>
      </div>

      {/* Par code bonus */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Par code bonus</div>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.6fr 0.8fr 1fr 1fr',
              gap: 8,
              padding: '10px 20px',
              borderBottom: '1px solid var(--border)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-4)',
            }}
          >
            <span>Code</span>
            <span style={{ textAlign: 'right' }}>Leads</span>
            <span style={{ textAlign: 'right' }}>Onboardés</span>
            <span style={{ textAlign: 'right' }}>Collecte</span>
          </div>
          {stats.byCode.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--text-3)' }}>
              Aucun lead BREACH pour l'instant (lance une synchro si la base vient d'être remplie).
            </div>
          ) : (
            stats.byCode.map((c, idx) => (
              <div
                key={c.code}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.6fr 0.8fr 1fr 1fr',
                  gap: 8,
                  padding: '12px 20px',
                  borderBottom: idx < stats.byCode.length - 1 ? '1px solid var(--border)' : 'none',
                  fontSize: 13,
                }}
              >
                <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{c.code}</span>
                <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>{c.total}</span>
                <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>
                  {c.onboarded} ({pct(c.onboarded, c.total)})
                </span>
                <span style={{ textAlign: 'right', color: 'var(--text-1)', fontWeight: 600 }}>
                  {money(c.invested)}
                </span>
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
        <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>{value}</span>
      </div>
    </div>
  );
}
