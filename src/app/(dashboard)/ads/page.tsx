import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  PlugZap,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { AdsPeriodFilter } from '@/components/shared/ads-period-filter';
import { Sparkline } from '@/components/shared/sparkline';
import { buildAdsAlerts, rankCampaigns } from '@/lib/ads/analytics';
import { type BlendedMetrics, getBlendedAcquisition } from '@/lib/ads/blended';
import { type AdCampaign, derive, getAdsOverview, rawOf } from '@/lib/ads/overview';
import { resolveAdsPeriod } from '@/lib/ads/period';
import { type CampaignRoi, getCampaignRoi } from '@/lib/ads/roi';
import { getAdsTrends } from '@/lib/ads/trends';
import { getAuthenticatedUser } from '@/lib/auth';
import { AdsReco } from './ads-reco';

export const dynamic = 'force-dynamic';

function eur(n: number | null, decimals = 0): string {
  if (n === null) return '—';
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} €`;
}
function int(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}
function pct(n: number): string {
  return `${n.toFixed(2)} %`;
}

function StatTile({
  label,
  value,
  hint,
  valueColor,
  deltaPct,
  deltaTone = 'down-good',
}: {
  label: string;
  value: string;
  hint?: string;
  valueColor?: string;
  deltaPct?: number | null;
  deltaTone?: 'up-good' | 'down-good' | 'neutral';
}) {
  return (
    <div
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '12px 14px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: valueColor ?? 'var(--text-1)',
          fontFamily: 'var(--font-mono)',
          marginTop: 2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
      {hint ? (
        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>{hint}</div>
      ) : null}
      {deltaPct !== undefined ? (
        <div style={{ marginTop: 3 }}>
          <DeltaBadge pct={deltaPct} tone={deltaTone} />
        </div>
      ) : null}
    </div>
  );
}

function DeltaBadge({
  pct,
  tone = 'up-good',
}: {
  pct: number | null;
  tone?: 'up-good' | 'down-good' | 'neutral';
}) {
  if (pct === null) return <span style={{ fontSize: 11, color: 'var(--text-4)' }}>—</span>;
  const up = pct > 0;
  let color = 'var(--text-4)';
  if (pct !== 0 && tone !== 'neutral') {
    const good = tone === 'up-good' ? up : !up;
    color = good ? 'var(--success)' : 'var(--danger)';
  }
  const Arrow = up ? TrendingUp : TrendingDown;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color }}>
      {pct !== 0 ? <Arrow size={11} /> : null}
      {up ? '+' : ''}
      {pct}% <span style={{ color: 'var(--text-4)' }}>vs préc.</span>
    </span>
  );
}

function TrendBlock({
  label,
  value,
  pct,
  tone,
  values,
  color,
}: {
  label: string;
  value: string;
  pct: number | null;
  tone: 'up-good' | 'down-good' | 'neutral';
  values?: number[];
  color?: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}
      >
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-3)',
            textTransform: 'uppercase',
            letterSpacing: 0.3,
          }}
        >
          {label}
        </span>
        <DeltaBadge pct={pct} tone={tone} />
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--text-1)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {value}
      </div>
      {values ? <Sparkline values={values} color={color ?? 'var(--accent)'} /> : null}
    </div>
  );
}

function CampaignCard({ c, roi }: { c: AdCampaign; roi?: CampaignRoi }) {
  const d = derive(rawOf(c));
  const roas = roi && c.spend > 0 ? roi.invested / c.spend : null;
  const costPerInvestor = roi && roi.investors > 0 ? c.spend / roi.investors : null;
  return (
    <div className="view-card">
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="badge badge-neutral">{c.platform}</span>
          <span
            style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', minWidth: 0, flex: 1 }}
          >
            {c.name}
          </span>
          <span
            className={`badge ${c.status === 'active' ? 'badge-success badge-dot' : 'badge-neutral'}`}
          >
            {c.status === 'active' ? 'Active' : 'Pause'}
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: 8,
          }}
        >
          <StatTile label="Dépense" value={eur(c.spend)} />
          <StatTile label="Impressions" value={int(c.impressions)} />
          {c.reach !== null ? <StatTile label="Portée" value={int(c.reach)} /> : null}
          <StatTile label="Clics" value={int(c.clicks)} />
          <StatTile label="CTR" value={pct(d.ctr)} />
          <StatTile label="CPC" value={eur(d.cpc, 2)} />
          <StatTile label="CPM" value={eur(d.cpm, 2)} />
          <StatTile label="Résultats" value={int(c.results)} />
          <StatTile label="Coût / résultat" value={eur(d.cpa, 2)} />
          {d.frequency !== null ? (
            <StatTile label="Fréquence" value={d.frequency.toFixed(2)} />
          ) : null}
        </div>
        {roi ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 8,
              paddingTop: 10,
              borderTop: '1px dashed var(--border)',
            }}
          >
            <StatTile label="Investisseurs" value={int(roi.investors)} hint="réels (SAH)" />
            <StatTile label="Capital investi" value={eur(roi.invested)} />
            <StatTile label="ROAS réel" value={roas === null ? '—' : `×${roas.toFixed(1)}`} />
            <StatTile label="Coût / investisseur" value={eur(costPerInvestor, 0)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AcqMetrics({
  spend,
  counts,
  metrics,
}: {
  spend: number;
  counts: { inscrits: number; complets: number; investisseurs: number; collecte: number };
  metrics: BlendedMetrics;
}) {
  const pr = metrics.profitRatio;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
        gap: 10,
      }}
    >
      <StatTile label="Dépense ads" value={eur(spend)} />
      <StatTile label="Inscrits" value={int(counts.inscrits)} hint="via le code" />
      <StatTile label="CPA réel" value={eur(metrics.cpa, 2)} hint="coût / inscrit" />
      <StatTile label="Inscrits complets" value={int(counts.complets)} hint="profil + KYC" />
      <StatTile label="CPI réel" value={eur(metrics.cpi, 2)} hint="coût / complet" />
      <StatTile label="Investisseurs" value={int(counts.investisseurs)} hint="ont signé" />
      <StatTile label="Coût / investisseur" value={eur(metrics.costPerInvestor, 0)} />
      <StatTile
        label="Investissement moyen"
        value={eur(metrics.avgTicket, 0)}
        hint="ticket moyen"
      />
      <StatTile
        label="Rentabilité"
        value={pr === null ? '—' : `×${pr.toFixed(1)}`}
        valueColor={pr === null ? undefined : pr >= 1 ? 'var(--success)' : 'var(--danger)'}
        hint={pr === null ? 'invest. moyen / coût' : pr >= 1 ? 'rentable ✓' : 'pas encore rentable'}
      />
    </div>
  );
}

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const user = await getAuthenticatedUser();
  const sp = await searchParams;
  const period = resolveAdsPeriod(sp);
  const [overview, trends, roi] = await Promise.all([
    getAdsOverview(period),
    getAdsTrends(period),
    getCampaignRoi(),
  ]);
  const { totals, platforms, campaigns, byPlatform } = overview;
  const spendByPlatform = Object.fromEntries(byPlatform.map((b) => [b.platform, b.raw.spend]));
  const blended = await getBlendedAcquisition(period, spendByPlatform);
  const globalRoas =
    roi.hasAttribution && totals.spend > 0 ? roi.totalInvested / totals.spend : null;
  const costPerInvestor =
    roi.hasAttribution && roi.totalInvestors > 0 ? totals.spend / roi.totalInvestors : null;
  const alerts = buildAdsAlerts(campaigns, totals.cpa);
  const ranking = rankCampaigns(campaigns);
  const canReco = user.role === 'admin' || user.role === 'executive';

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 className="page-title">Ads Control</h1>
          <div className="page-desc">
            Vue consolidée Meta + Google Ads (lecture seule) · période : {period.label}
          </div>
        </div>
        <AdsPeriodFilter />
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

      {/* KPIs globaux */}
      <div
        className="kpi-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 10,
        }}
      >
        <StatTile label="Dépense" value={eur(totals.spend)} hint="Meta + Google" />
        <StatTile label="Impressions" value={int(totals.impressions)} />
        {totals.hasReach ? (
          <StatTile label="Portée" value={int(totals.reach)} hint="cumul (approx.)" />
        ) : null}
        <StatTile label="Clics" value={int(totals.clicks)} />
        <StatTile label="CTR" value={pct(totals.ctr)} />
        <StatTile label="CPC" value={eur(totals.cpc, 2)} hint="coût / clic" />
        <StatTile label="CPM" value={eur(totals.cpm, 2)} hint="/ 1000 impr." />
        <StatTile label="Résultats" value={int(totals.results)} hint="conversions / leads" />
        <StatTile label="Coût / résultat" value={eur(totals.cpa, 2)} />
        <StatTile label="Campagnes actives" value={`${totals.activeCount} / ${campaigns.length}`} />
      </div>

      {/* Coût réel d'acquisition : dépense pub attribuée par code bonus, croisée SAH */}
      {blended.available && (
        <div
          className="view-card"
          style={{ borderColor: 'color-mix(in srgb, var(--accent) 45%, transparent)' }}
        >
          <div className="view-card-header">
            <div className="view-card-title">Coût réel d'acquisition · croisé SAH</div>
            <span className="badge badge-success badge-dot">attribué par code</span>
          </div>
          <div
            className="view-card-body"
            style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
          >
            <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 }}>
              Chaque inscrit est rattaché à sa source via son <strong>code bonus</strong> :{' '}
              <strong>SEVEN-BREACH → Meta</strong>, <strong>BREACH-VIP → Google</strong>. On{' '}
              <strong>ignore les conversions déclarées par les régies</strong> (gonflées) et on
              divise leur dépense par les <strong>vrais inscrits SAH</strong> de ce code. C'est ce
              qui corrige le « Meta dit 600 inscrits, il y en a 180 ».
            </div>

            {blended.platforms.length > 1 && blended.total ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-2)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                  }}
                >
                  Total ads (Meta + Google)
                </div>
                <AcqMetrics
                  spend={blended.total.spend}
                  counts={blended.total.counts}
                  metrics={blended.total.metrics}
                />
              </div>
            ) : null}

            {blended.platforms.map((p) => (
              <div key={p.platform} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge badge-neutral">{p.platform}</span>
                  <span
                    style={{ fontSize: 12, color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}
                  >
                    code {p.code}
                  </span>
                </div>
                <AcqMetrics spend={p.spend} counts={p.counts} metrics={p.metrics} />
              </div>
            ))}

            <div style={{ fontSize: 11, color: 'var(--text-4)', lineHeight: 1.5 }}>
              « complet » = profil renseigné + KYC validé · investisseurs &amp; collecte =
              souscriptions signées sur la période par ces inscrits · une période récente est encore
              partielle (le closing prend plusieurs semaines). Mapping codes : SEVEN-BREACH* → Meta,
              *VIP* → Google — dis-moi si tu ajoutes d'autres codes pub.
            </div>
          </div>
        </div>
      )}

      {/* ROI réel : pub -> investisseurs */}
      <div
        className="view-card"
        style={{ borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }}
      >
        <div className="view-card-header">
          <div className="view-card-title">ROI réel · pub → investisseurs</div>
          {roi.hasAttribution ? (
            <span className="badge badge-success badge-dot">données SAH</span>
          ) : (
            <span className="badge badge-neutral">en attente SAH</span>
          )}
        </div>
        <div className="view-card-body">
          {roi.hasAttribution ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: 10,
              }}
            >
              <StatTile
                label="Investisseurs"
                value={int(roi.totalInvestors)}
                hint="réels générés"
              />
              <StatTile label="Capital investi" value={eur(roi.totalInvested)} />
              <StatTile
                label="ROAS réel"
                value={globalRoas === null ? '—' : `×${globalRoas.toFixed(1)}`}
                hint="investi / dépensé"
              />
              <StatTile label="Coût / investisseur" value={eur(costPerInvestor, 0)} />
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
              La tuyauterie est prête : dès que SAH renseigne l'
              <strong>origine d'acquisition</strong> de chaque inscrit (la campagne d'où il vient),
              THE PILOT reliera automatiquement la dépense pub aux{' '}
              <strong>investisseurs réels</strong> et au <strong>capital investi</strong> — pour
              calculer le coût par investisseur et le ROAS réel, par campagne. (À voir lors de
              l'appel SAH.)
            </div>
          )}
        </div>
      </div>

      {/* Évolution + comparaison période précédente */}
      {trends.available && (
        <div className="view-card">
          <div className="view-card-header">
            <div className="view-card-title">Évolution sur la période</div>
            <span style={{ fontSize: 12, color: 'var(--text-4)' }}>vs période précédente</span>
          </div>
          <div className="view-card-body">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 18,
              }}
            >
              <TrendBlock
                label="Dépense"
                value={eur(trends.current.spend)}
                pct={trends.deltaPct.spend}
                tone="neutral"
                values={trends.series.map((p) => p.spend)}
                color="var(--accent)"
              />
              <TrendBlock
                label="Clics"
                value={int(trends.current.clicks)}
                pct={trends.deltaPct.clicks}
                tone="up-good"
                values={trends.series.map((p) => p.clicks)}
                color="var(--info, #3b82f6)"
              />
              <TrendBlock
                label="Résultats"
                value={int(trends.current.results)}
                pct={trends.deltaPct.results}
                tone="up-good"
                values={trends.series.map((p) => p.results)}
                color="var(--success)"
              />
              <TrendBlock
                label="Coût / résultat"
                value={eur(trends.current.cpa, 2)}
                pct={trends.deltaPct.cpa}
                tone="down-good"
              />
            </div>
          </div>
        </div>
      )}

      {/* Analyse IA du Pilote (admin / gérant) */}
      {canReco && campaigns.length > 0 && <AdsReco />}

      {/* Alertes */}
      {alerts.length > 0 && (
        <div className="view-card">
          <div className="view-card-header">
            <div
              className="view-card-title"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <AlertTriangle size={16} /> À surveiller ({alerts.length})
            </div>
          </div>
          <div
            className="view-card-body"
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {alerts.map((a) => {
              const danger = a.level === 'danger';
              const color = danger ? 'var(--danger)' : 'var(--warning)';
              return (
                <div
                  key={`${a.title}|${a.detail}`}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: `color-mix(in srgb, ${color} 8%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
                  }}
                >
                  <span style={{ color, display: 'flex', marginTop: 1 }}>
                    <AlertTriangle size={14} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                      {a.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{a.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top / Flop */}
      {(ranking.best.length > 0 || ranking.wasted.length > 0) && (
        <div
          className="split-2col"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
        >
          <div className="view-card">
            <div className="view-card-header">
              <div
                className="view-card-title"
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Trophy size={15} /> Meilleures (coût / résultat)
              </div>
            </div>
            <div
              className="view-card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {ranking.best.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Aucune campagne avec résultats.
                </div>
              ) : (
                ranking.best.map((x) => (
                  <div
                    key={`${x.c.platform}-${x.c.id}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      fontSize: 13,
                    }}
                  >
                    <span
                      style={{
                        color: 'var(--text-2)',
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {x.c.platform} · {x.c.name}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--success)',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {eur(x.cpa, 0)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="view-card">
            <div className="view-card-header">
              <div
                className="view-card-title"
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <TrendingDown size={15} /> À optimiser
              </div>
            </div>
            <div
              className="view-card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {ranking.worst.map((x) => (
                <div
                  key={`${x.c.platform}-${x.c.id}`}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}
                >
                  <span
                    style={{
                      color: 'var(--text-2)',
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {x.c.platform} · {x.c.name}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--warning)',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {eur(x.cpa, 0)}
                  </span>
                </div>
              ))}
              {ranking.wasted.length > 0 && (
                <>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-4)',
                      marginTop: 4,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Ban size={12} /> Budget sans résultat
                  </div>
                  {ranking.wasted.map((c) => (
                    <div
                      key={`${c.platform}-${c.id}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        fontSize: 13,
                      }}
                    >
                      <span
                        style={{
                          color: 'var(--text-2)',
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c.platform} · {c.name}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--danger)',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {eur(c.spend, 0)}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Répartition par plateforme */}
      {byPlatform.length > 1 && (
        <div className="view-card">
          <div className="view-card-header">
            <div className="view-card-title">Répartition par plateforme</div>
          </div>
          <div
            className="view-card-body"
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {byPlatform.map((b) => (
              <div
                key={b.platform}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px repeat(4, 1fr)',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <span className="badge badge-neutral">{b.platform}</span>
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  <span style={{ color: 'var(--text-4)', fontSize: 11 }}>Dépense</span>
                  <br />
                  {eur(b.raw.spend)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  <span style={{ color: 'var(--text-4)', fontSize: 11 }}>Clics</span>
                  <br />
                  {int(b.raw.clicks)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  <span style={{ color: 'var(--text-4)', fontSize: 11 }}>Résultats</span>
                  <br />
                  {int(b.raw.results)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  <span style={{ color: 'var(--text-4)', fontSize: 11 }}>Coût / résultat</span>
                  <br />
                  {eur(b.derived.cpa, 2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Campagnes détaillées */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
          Campagnes ({campaigns.length})
        </div>
        {campaigns.length === 0 ? (
          <div className="view-card">
            <div className="view-card-body" style={{ fontSize: 13, color: 'var(--text-3)' }}>
              Aucune campagne à afficher pour cette période.
            </div>
          </div>
        ) : (
          campaigns.map((c) => (
            <CampaignCard key={`${c.platform}-${c.id}`} c={c} roi={roi.byCampaign.get(c.id)} />
          ))
        )}
      </div>
    </>
  );
}
