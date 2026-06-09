import { TrendingDown, TrendingUp } from 'lucide-react';

const CAMPAIGNS = [
  {
    id: 'c1',
    platform: 'Meta',
    name: 'Brézins · LAL épargnants',
    status: 'active',
    spend: '4 832€',
    cpa: '38€',
    ctr: '2.4%',
  },
  {
    id: 'c2',
    platform: 'Google',
    name: 'Search · investissement immobilier',
    status: 'active',
    spend: '3 217€',
    cpa: '52€',
    ctr: '4.1%',
  },
  {
    id: 'c3',
    platform: 'LinkedIn',
    name: 'CSP+ retargeting B',
    status: 'active',
    spend: '2 410€',
    cpa: '78€',
    ctr: '1.8%',
  },
  {
    id: 'c4',
    platform: 'Meta',
    name: 'Capsule · audience nouvelle',
    status: 'paused',
    spend: '1 105€',
    cpa: '64€',
    ctr: '1.9%',
  },
];

export default function AdsPage() {
  return (
    <>
      <div>
        <h1 className="page-title">Ads Control</h1>
        <div className="page-desc">Cockpit unifié Meta + Google + LinkedIn (read-only en V1).</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div className="kpi-hero">
          <div className="kpi-hero-label">Dépense M</div>
          <div className="kpi-hero-value">
            11,5<span className="kpi-hero-value-currency">K€</span>
          </div>
          <div className="kpi-hero-trend">
            <span className="kpi-hero-trend-arrow flat">stable</span>
            <span>vs M-1</span>
          </div>
        </div>
        <div className="kpi-hero">
          <div className="kpi-hero-label">CPA blended</div>
          <div className="kpi-hero-value">
            42<span className="kpi-hero-value-currency">€</span>
          </div>
          <div className="kpi-hero-trend">
            <span className="kpi-hero-trend-arrow down">
              <TrendingDown size={10} />
              +6%
            </span>
            <span>vs M-1</span>
          </div>
        </div>
        <div className="kpi-hero">
          <div className="kpi-hero-label">ROAS</div>
          <div className="kpi-hero-value">12,4x</div>
          <div className="kpi-hero-trend">
            <span className="kpi-hero-trend-arrow up">
              <TrendingUp size={10} />
              +9%
            </span>
            <span>vs M-1</span>
          </div>
        </div>
        <div className="kpi-hero">
          <div className="kpi-hero-label">Campagnes actives</div>
          <div className="kpi-hero-value">
            {CAMPAIGNS.filter((c) => c.status === 'active').length}
          </div>
          <div className="kpi-hero-trend">
            <span>sur 3 plateformes</span>
          </div>
        </div>
      </div>

      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Campagnes</div>
          <span className="badge badge-success badge-dot">Sync il y a 3 min</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {CAMPAIGNS.map((c, idx) => (
            <div
              key={c.id}
              className="r-stack"
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr auto auto auto auto',
                alignItems: 'center',
                gap: 16,
                padding: '14px 20px',
                borderBottom: idx < CAMPAIGNS.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <span className="badge badge-neutral">{c.platform}</span>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>{c.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}>
                {c.spend}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}>
                CPA {c.cpa}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)' }}>
                CTR {c.ctr}
              </div>
              <span
                className={`badge ${c.status === 'active' ? 'badge-success badge-dot' : 'badge-neutral'}`}
              >
                {c.status === 'active' ? 'Active' : 'Pause'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
