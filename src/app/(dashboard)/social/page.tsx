import { Share2, TrendingUp } from 'lucide-react';

const COMPETITORS = [
  { name: 'Anaxago', posts: 24, engagement: '4.2K', trend: '+12%' },
  { name: 'Homunity', posts: 18, engagement: '2.8K', trend: '+8%' },
  { name: 'Bricks', posts: 31, engagement: '6.1K', trend: '+34%' },
  { name: 'ClubFunding', posts: 9, engagement: '1.4K', trend: '-4%' },
];

export default function SocialPage() {
  return (
    <>
      <div>
        <h1 className="page-title">Social Hub</h1>
        <div className="page-desc">Veille concurrentielle + calendrier de publication (V2).</div>
      </div>

      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Veille concurrentielle · 7 derniers jours</div>
          <span className="badge badge-ai badge-dot">Scraping auto via n8n</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {COMPETITORS.map((c, idx) => (
            <div
              key={c.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '14px 20px',
                borderBottom: idx < COMPETITORS.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'var(--ai-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--ai)',
                  flexShrink: 0,
                }}
              >
                <Share2 size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
                  {c.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-3)',
                    fontFamily: 'var(--font-mono)',
                    marginTop: 2,
                  }}
                >
                  {c.posts} posts · {c.engagement} interactions
                </div>
              </div>
              <span className={`kpi-hero-trend-arrow ${c.trend.startsWith('+') ? 'up' : 'down'}`}>
                <TrendingUp size={10} />
                {c.trend}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="alert alert-info">
        <span className="alert-icon">
          <Share2 size={16} />
        </span>
        <div className="alert-body">
          <div className="alert-title">Module Social Hub — V2</div>
          <div className="alert-description">
            Calendrier de publication multi-plateformes, génération auto de posts et inbox unifiée
            arriveront en V2 (cf. roadmap, section 16 de THE_PILOT.md).
          </div>
        </div>
      </div>
    </>
  );
}
