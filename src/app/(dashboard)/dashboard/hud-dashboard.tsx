import { ArrowUpRight, CalendarDays, MapPin, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { GlobalStats } from '@/lib/db/queries/dashboard';

function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}
function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

/** En-tête de carte HUD : titre + sous-titre + bouton rond ↗. */
function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="hud-card-head">
      <div>
        <div className="hud-title">{title}</div>
        <div className="hud-sub">{sub}</div>
      </div>
      <span className="hud-arrow">
        <ArrowUpRight size={14} />
      </span>
    </div>
  );
}

export function HudDashboard({ stats, dateLabel }: { stats: GlobalStats; dateLabel: string }) {
  const onbRate = pct(stats.investors.onboarded, stats.investors.total);
  // Jauge semi-circulaire (180°) — longueur d'arc ≈ π·90.
  const ARC = Math.PI * 90;
  const maxMonth = Math.max(1, ...stats.byMonth.map((m) => m.collected));
  const maxProj = Math.max(1, ...stats.topProjects.map((p) => p.collected));
  const projColors = ['#E8C547', '#F0A33C', '#B5E550', '#8FC93A', '#E85C4A', '#7BC950'];

  return (
    <>
      <div className="hud-bg" />
      <div className="hud-root">
        {/* Titre posé sur le fond */}
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 600, color: '#F4F7EE', margin: 0 }}>
            Seven At Home
          </h1>
          <div
            style={{
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              fontSize: 12,
              color: 'rgba(244,247,238,.75)',
              marginTop: 6,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <MapPin size={13} /> Cabine de pilotage — données live
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <CalendarDays size={13} /> {dateLabel}
            </span>
          </div>
        </div>

        {/* KPIs principaux */}
        <div className="kpi-grid">
          <KpiTile label="Collecte totale" value={money(stats.collecte.total)} accent />
          <KpiTile label="Investisseurs" value={stats.investors.total.toLocaleString('fr-FR')} />
          <KpiTile label="Onboardés" value={`${stats.investors.onboarded} · ${onbRate}%`} />
          <KpiTile
            label="Projets ouverts"
            value={`${stats.projects.open} / ${stats.projects.total}`}
          />
        </div>

        <div className="split-2col">
          {/* Colonne gauche : jauge + acquisition */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="hud-card">
              <Head
                title="Santé du funnel"
                sub="Part des inscrits allés jusqu'au KYC validé (onboardés)."
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <svg
                  viewBox="0 0 220 124"
                  width="180"
                  height="102"
                  role="img"
                  aria-label="Taux d'onboarding"
                >
                  <title>Taux d'onboarding</title>
                  <defs>
                    <linearGradient id="hudGauge" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#F2C94C" />
                      <stop offset="100%" stopColor="#B5E550" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 20 114 A 90 90 0 0 1 200 114"
                    fill="none"
                    stroke="rgba(255,255,255,.08)"
                    strokeWidth="12"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 20 114 A 90 90 0 0 1 200 114"
                    fill="none"
                    stroke="url(#hudGauge)"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${(onbRate / 100) * ARC} ${ARC}`}
                  />
                </svg>
                <div>
                  <div className="hud-value" style={{ fontSize: 38 }}>
                    {onbRate}%
                  </div>
                  <div className="hud-sub">{stats.investors.onboarded} onboardés</div>
                </div>
              </div>
            </div>

            <div className="hud-card">
              <Head
                title="Acquisition ce mois"
                sub="Nouveaux inscrits et collecte du mois en cours."
              />
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="hud-tile" style={{ flex: 1 }}>
                  <div className="hud-value" style={{ fontSize: 22 }}>
                    {stats.investors.newMonth}
                  </div>
                  <div className="hud-label">Nouveaux ({stats.investors.new7d} sur 7 j)</div>
                </div>
                <div className="hud-tile" style={{ flex: 1 }}>
                  <div className="hud-value hud-accent" style={{ fontSize: 22 }}>
                    {money(stats.collecte.month)}
                  </div>
                  <div className="hud-label">Collecte du mois</div>
                </div>
              </div>
            </div>
          </div>

          {/* Colonne droite : vue d'ensemble 2×2 + heatmap mensuelle */}
          <div className="hud-card">
            <Head title="Vue d'ensemble SAH" sub="Les chiffres clés de la plateforme, en direct." />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Stat label="Souscriptions" value={stats.collecte.subs.toLocaleString('fr-FR')} />
              <Stat
                label="Investisseurs actifs"
                value={stats.collecte.investors.toLocaleString('fr-FR')}
              />
              <Stat label="Ticket moyen" value={money(stats.collecte.avgTicket)} />
              <Stat label="Leads BREACH" value={stats.breachLeads.toLocaleString('fr-FR')} />
            </div>

            <div style={{ marginTop: 14 }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span className="hud-label">Collecte par mois</span>
                <span className="hud-label hud-accent">6 derniers mois</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  alignItems: 'flex-end',
                  height: 70,
                  marginTop: 8,
                }}
              >
                {stats.byMonth.map((m) => {
                  const ratio = m.collected / maxMonth;
                  return (
                    <div
                      key={m.month}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: `${Math.max(4, ratio * 56)}px`,
                          borderRadius: 4,
                          background:
                            ratio > 0.66
                              ? '#B5E550'
                              : ratio > 0.33
                                ? '#D7DE4A'
                                : 'rgba(181,229,80,.35)',
                        }}
                      />
                      <span style={{ fontSize: 9, color: 'rgba(244,247,238,.4)' }}>
                        {m.month.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 14,
              }}
            >
              <span className="hud-sub">
                {money(stats.breachCollecte)} de collecte attribuée à BREACH.
              </span>
              <Link href="/brain" className="hud-cta">
                <Sparkles size={12} /> Pilot Brain
              </Link>
            </div>
          </div>
        </div>

        <div className="split-2col">
          {/* Collecte par projet (barres) */}
          <div className="hud-card">
            <Head title="Collecte par projet" sub="Les projets qui ont le plus collecté." />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {stats.topProjects.length === 0 ? (
                <span className="hud-sub">Aucune donnée (lance une synchro).</span>
              ) : (
                stats.topProjects.map((p, i) => (
                  <div key={p.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span
                        style={{
                          color: '#F4F7EE',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.name}
                      </span>
                      <span style={{ color: 'rgba(244,247,238,.62)' }}>
                        {money(p.collected)} · {p.investors} inv.
                      </span>
                    </div>
                    <div
                      style={{ height: 6, background: 'rgba(255,255,255,.08)', borderRadius: 999 }}
                    >
                      <div
                        style={{
                          width: `${Math.max(2, (p.collected / maxProj) * 100)}%`,
                          height: '100%',
                          borderRadius: 999,
                          background: projColors[i % projColors.length],
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Funnel (pastilles) */}
          <div className="hud-card">
            <Head title="Funnel d'inscription" sub="De l'inscription au KYC validé." />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <FunnelRow
                label="Inscrits"
                value={stats.investors.total}
                total={stats.investors.total}
                color="#7BC950"
              />
              <FunnelRow
                label="Profil complété"
                value={stats.investors.registered}
                total={stats.investors.total}
                color="#D7DE4A"
              />
              <FunnelRow
                label="Onboardés (KYC)"
                value={stats.investors.onboarded}
                total={stats.investors.total}
                color="#B5E550"
              />
              <FunnelRow
                label="Investisseurs"
                value={stats.collecte.investors}
                total={stats.investors.total}
                color="#8FC93A"
              />
            </div>
          </div>
        </div>

        {/* Bande basse : accès rapides (façon HUD) */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            justifyContent: 'center',
            paddingTop: 4,
          }}
        >
          <Link href="/closing" className="hud-pill">
            File d'appels
          </Link>
          <Link href="/projects" className="hud-pill">
            Projets
          </Link>
          <Link href="/breach" className="hud-pill hud-pill-active">
            BREACH
          </Link>
          <Link href="/closing/performance" className="hud-pill">
            Performance
          </Link>
        </div>
      </div>
    </>
  );
}

function KpiTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="hud-card" style={{ padding: 16 }}>
      <div className="hud-label">{label}</div>
      <div
        className={`hud-value ${accent ? 'hud-accent' : ''}`}
        style={{ fontSize: 26, marginTop: 6 }}
      >
        {value}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="hud-tile">
      <div className="hud-label">{label}</div>
      <div className="hud-value" style={{ fontSize: 20, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function FunnelRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const ratio = total > 0 ? value / total : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: '#F4F7EE' }}>{label}</span>
        <span style={{ color: 'rgba(244,247,238,.62)' }}>
          {value.toLocaleString('fr-FR')} ({Math.round(ratio * 100)}%)
        </span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,.08)', borderRadius: 999 }}>
        <div
          style={{
            width: `${Math.max(2, ratio * 100)}%`,
            height: '100%',
            borderRadius: 999,
            background: color,
          }}
        />
      </div>
    </div>
  );
}
