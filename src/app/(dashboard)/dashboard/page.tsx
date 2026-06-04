import {
  AlertTriangle,
  CircleCheck,
  Info,
  Minus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { getGlobalStats } from '@/lib/db/queries/dashboard';
import { mockAlerts } from '@/lib/mock-data';
import { HudDashboard } from './hud-dashboard';

export const dynamic = 'force-dynamic';

const TrendArrow = ({ direction }: { direction: 'up' | 'down' | 'flat' }) => {
  if (direction === 'up') return <TrendingUp size={10} />;
  if (direction === 'down') return <TrendingDown size={10} />;
  return <Minus size={10} />;
};

const AlertIcon = ({ type }: { type: 'ai' | 'success' | 'warning' | 'danger' | 'info' }) => {
  const size = 16;
  if (type === 'ai') return <Sparkles size={size} />;
  if (type === 'success') return <CircleCheck size={size} />;
  if (type === 'warning') return <AlertTriangle size={size} />;
  if (type === 'danger') return <XCircle size={size} />;
  return <Info size={size} />;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ style?: string }>;
}) {
  const sp = await searchParams;
  const isHud = sp.style === 'hud';

  const now = new Date();
  const dateLabel = now.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      {/* Bascule de vue (réversible) */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', gap: 6 }}>
        <Link href="/dashboard" className={`btn btn-sm ${isHud ? 'btn-secondary' : 'btn-primary'}`}>
          Classique
        </Link>
        <Link
          href="/dashboard?style=hud"
          className={`btn btn-sm ${isHud ? 'btn-primary' : 'btn-secondary'}`}
        >
          HUD (nouveau)
        </Link>
      </div>

      {isHud ? (
        <HudDashboard stats={await getGlobalStats()} dateLabel={dateLabel} />
      ) : (
        <ClassicDashboard />
      )}
    </>
  );
}

function ClassicDashboard() {
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
        }}
      >
        <div>
          <h1 className="page-title">Bonjour Killian</h1>
          <div className="page-desc">
            {today.charAt(0).toUpperCase() + today.slice(1)} · 5 actions IA · 3 hot leads
          </div>
        </div>
        <button type="button" className="btn btn-ai">
          <Sparkles />
          Demander à Pilot
        </button>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Collecte M" value="142,4K€" trend="+34%" direction="up" vs="vs M-1" />
        <KpiCard label="Hot leads" value="14" trend="+3" direction="up" vs="vs hier" />
        <KpiCard label="CPA blended" value="42€" trend="+6%" direction="down" vs="vs M-1" />
        <KpiCard label="IA actions" value="847" trend="+18%" direction="up" vs="ce mois" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div className="view-card">
          <div className="view-card-header">
            <div>
              <div className="view-card-title">Collecte sur 6 mois</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                Attribution multi-touch (mocked)
              </div>
            </div>
            <button type="button" className="btn btn-ghost btn-sm">
              6M
            </button>
          </div>
          <div className="view-card-body">
            <svg
              viewBox="0 0 600 200"
              preserveAspectRatio="none"
              role="img"
              aria-label="Évolution de la collecte sur 6 mois"
              style={{ width: '100%', height: 200 }}
            >
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M 0 160 L 100 150 L 200 130 L 300 110 L 400 90 L 500 60 L 600 35 L 600 200 L 0 200 Z"
                fill="url(#chartGrad)"
              />
              <path
                d="M 0 160 L 100 150 L 200 130 L 300 110 L 400 90 L 500 60 L 600 35"
                stroke="#2563EB"
                strokeWidth="2"
                fill="none"
              />
              {[0, 100, 200, 300, 400, 500, 600].map((x, i) => {
                const ys = [160, 150, 130, 110, 90, 60, 35];
                return <circle key={x} cx={x} cy={ys[i]} r={3} fill="#2563EB" />;
              })}
            </svg>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-4)',
                marginTop: 8,
              }}
            >
              <span>Déc</span>
              <span>Jan</span>
              <span>Fév</span>
              <span>Mar</span>
              <span>Avr</span>
              <span>Mai</span>
            </div>
          </div>
        </div>

        <div className="view-card">
          <div className="view-card-header">
            <div className="view-card-title">Activité récente</div>
            <span className="badge badge-ai" style={{ fontSize: 10 }}>
              IA active
            </span>
          </div>
          <div
            className="view-card-body"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            {mockAlerts.map((alert) => (
              <div key={alert.id} className={`alert alert-${alert.type}`}>
                <span className="alert-icon">
                  <AlertIcon type={alert.type} />
                </span>
                <div className="alert-body">
                  <div className="alert-title">{alert.title}</div>
                  <div className="alert-description">{alert.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function KpiCard({
  label,
  value,
  trend,
  direction,
  vs,
}: {
  label: string;
  value: string;
  trend: string;
  direction: 'up' | 'down' | 'flat';
  vs: string;
}) {
  const match = value.match(/^(.*?)(€|K€|M€)?$/);
  const main = match?.[1] ?? value;
  const currency = match?.[2] ?? '';

  return (
    <div className="kpi-hero">
      <div className="kpi-hero-label">{label}</div>
      <div className="kpi-hero-value">
        {main}
        {currency && <span className="kpi-hero-value-currency">{currency}</span>}
      </div>
      <div className="kpi-hero-trend">
        <span className={`kpi-hero-trend-arrow ${direction}`}>
          <TrendArrow direction={direction} />
          {trend}
        </span>
        {vs && <span>{vs}</span>}
      </div>
    </div>
  );
}
