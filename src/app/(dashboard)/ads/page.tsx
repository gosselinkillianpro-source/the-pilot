import { AlertTriangle, CheckCircle2, PlugZap } from 'lucide-react';
import { getAdsOverview } from '@/lib/ads/overview';
import { getAuthenticatedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}
function nb(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

export default async function AdsPage() {
  await getAuthenticatedUser();
  const overview = await getAdsOverview();
  const { totals, platforms, campaigns } = overview;

  return (
    <>
      <div>
        <h1 className="page-title">Ads Control</h1>
        <div className="page-desc">
          Vue consolidée Meta + Google Ads (lecture seule). Données réelles du mois en cours.
        </div>
      </div>

      {/* État des connexions */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {platforms.map((p) => {
          const tone = p.ok ? 'success' : p.configured ? 'danger' : 'neutral';
          const label = p.ok ? 'Connecté' : p.configured ? 'Erreur' : 'Non connecté';
          return (
            <div key={p.platform} className="view-card" style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div
                className="view-card-body"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}
              >
                <span
                  style={{
                    color:
                      tone === 'success'
                        ? 'var(--success)'
                        : tone === 'danger'
                          ? 'var(--danger)'
                          : 'var(--text-4)',
                    display: 'flex',
                  }}
                >
                  {p.ok ? (
                    <CheckCircle2 size={18} />
                  ) : p.configured ? (
                    <AlertTriangle size={18} />
                  ) : (
                    <PlugZap size={18} />
                  )}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                    {p.platform} Ads
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {label}
                    {!p.ok && p.reason ? ` · ${p.reason}` : ''}
                    {p.ok ? ` · ${p.campaigns.length} campagne(s)` : ''}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!overview.anyConfigured && (
        <div className="alert alert-info">
          <span className="alert-icon">
            <PlugZap size={16} />
          </span>
          <div className="alert-body">
            <div className="alert-title">Aucune plateforme connectée</div>
            <div className="alert-description">
              Renseigne les clés Meta (META_SYSTEM_USER_TOKEN) et/ou Google Ads dans les variables
              d'environnement Render. Tant qu'aucune clé n'est présente, aucune donnée n'est
              affichée (plutôt que des chiffres factices).
            </div>
          </div>
        </div>
      )}

      {/* KPIs réels */}
      <div
        className="kpi-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}
      >
        <div className="kpi-hero">
          <div className="kpi-hero-label">Dépense (mois)</div>
          <div className="kpi-hero-value">{money(totals.spend)}</div>
          <div className="kpi-hero-trend">
            <span>Meta + Google</span>
          </div>
        </div>
        <div className="kpi-hero">
          <div className="kpi-hero-label">CPA blended</div>
          <div className="kpi-hero-value">
            {totals.cpaBlended === null ? '—' : money(totals.cpaBlended)}
          </div>
          <div className="kpi-hero-trend">
            <span>{nb(totals.results)} résultat(s)</span>
          </div>
        </div>
        <div className="kpi-hero">
          <div className="kpi-hero-label">Clics</div>
          <div className="kpi-hero-value">{nb(totals.clicks)}</div>
          <div className="kpi-hero-trend">
            <span>{nb(totals.impressions)} impressions</span>
          </div>
        </div>
        <div className="kpi-hero">
          <div className="kpi-hero-label">Campagnes actives</div>
          <div className="kpi-hero-value">{totals.activeCount}</div>
          <div className="kpi-hero-trend">
            <span>sur {campaigns.length} au total</span>
          </div>
        </div>
      </div>

      {/* Campagnes */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Campagnes</div>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {campaigns.length === 0 ? (
            <div style={{ padding: '20px', fontSize: 13, color: 'var(--text-3)' }}>
              Aucune campagne à afficher pour le mois en cours.
            </div>
          ) : (
            campaigns.map((c, idx) => (
              <div
                key={`${c.platform}-${c.id}`}
                className="r-stack"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 1fr auto auto auto auto',
                  alignItems: 'center',
                  gap: 16,
                  padding: '14px 20px',
                  borderBottom: idx < campaigns.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span className="badge badge-neutral">{c.platform}</span>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', minWidth: 0 }}>
                  {c.name}
                </div>
                <div
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}
                >
                  {money(c.spend)}
                </div>
                <div
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}
                >
                  CPA {c.cpa === null ? '—' : money(c.cpa)}
                </div>
                <div
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)' }}
                >
                  CTR {c.ctr.toFixed(1)}%
                </div>
                <span
                  className={`badge ${c.status === 'active' ? 'badge-success badge-dot' : 'badge-neutral'}`}
                >
                  {c.status === 'active' ? 'Active' : 'Pause'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
