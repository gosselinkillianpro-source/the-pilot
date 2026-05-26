import { BarChart3, TrendingUp } from 'lucide-react';

const CHANNELS = [
  { name: 'LinkedIn Ads', investors: 412, ltv: '14 200€', cac: '78€', roi: '18.2x' },
  { name: 'Meta Ads', investors: 1284, ltv: '8 400€', cac: '38€', roi: '22.1x' },
  { name: 'Google Ads', investors: 632, ltv: '11 800€', cac: '52€', roi: '22.7x' },
  { name: 'Parrainage', investors: 184, ltv: '18 600€', cac: '12€', roi: '155x' },
  { name: 'SEO / direct', investors: 138, ltv: '9 200€', cac: '0€', roi: '∞' },
];

export default function PerformancePage() {
  return (
    <>
      <div>
        <h1 className="page-title">Performance Lab</h1>
        <div className="page-desc">
          LTV par canal d'acquisition · cohortes · forecasting (V2 complet).
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div className="kpi-hero">
          <div className="kpi-hero-label">Collecte YTD</div>
          <div className="kpi-hero-value">
            2,1<span className="kpi-hero-value-currency">M€</span>
          </div>
          <div className="kpi-hero-trend">
            <span className="kpi-hero-trend-arrow up">
              <TrendingUp size={10} />
              +62%
            </span>
            <span>vs N-1</span>
          </div>
        </div>
        <div className="kpi-hero">
          <div className="kpi-hero-label">LTV moyen</div>
          <div className="kpi-hero-value">
            10,8<span className="kpi-hero-value-currency">K€</span>
          </div>
          <div className="kpi-hero-trend">
            <span className="kpi-hero-trend-arrow up">
              <TrendingUp size={10} />
              +14%
            </span>
            <span>cohorte 2025</span>
          </div>
        </div>
        <div className="kpi-hero">
          <div className="kpi-hero-label">Investisseurs actifs</div>
          <div className="kpi-hero-value">2 650</div>
          <div className="kpi-hero-trend">
            <span className="kpi-hero-trend-arrow up">
              <TrendingUp size={10} />
              +38
            </span>
            <span>ce mois</span>
          </div>
        </div>
      </div>

      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">LTV par canal d'acquisition · 24 derniers mois</div>
          <button type="button" className="btn btn-ghost btn-sm">
            Exporter
          </button>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {CHANNELS.map((c, idx) => (
            <div
              key={c.name}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto auto',
                alignItems: 'center',
                gap: 16,
                padding: '14px 20px',
                borderBottom: idx < CHANNELS.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'var(--brand-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--brand)',
                    flexShrink: 0,
                  }}
                >
                  <BarChart3 size={16} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
                  {c.name}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)' }}>
                {c.investors} investisseurs
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}>
                LTV {c.ltv}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}>
                CAC {c.cac}
              </div>
              <span className="badge badge-success">ROI {c.roi}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
