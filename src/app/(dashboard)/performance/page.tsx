import { Link as LinkIcon, Phone, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { PerformanceTabs } from '@/components/shared/performance-tabs';
import { PeriodFilter } from '@/components/shared/period-filter';
import { StatCard } from '@/components/shared/stat-card';
import { getAuthenticatedUser } from '@/lib/auth';
import { getBreachStats, getCloserPerformance } from '@/lib/db/queries/closing';
import { getInvestorStats } from '@/lib/db/queries/investors';
import { resolvePeriod } from '@/lib/period';
import { PilotePanel } from './pilote-panel';

export const dynamic = 'force-dynamic';

function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}
function nb(n: number): string {
  return n.toLocaleString('fr-FR');
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const period = resolvePeriod(await searchParams);
  const [user, report, breach, stats] = await Promise.all([
    getAuthenticatedUser(),
    getCloserPerformance(period),
    getBreachStats(period),
    getInvestorStats(),
  ]);
  const isAdmin = user.role === 'admin';

  const attributedToCalls = report.totalAmount - report.unattributed.amount;
  const callsCount = report.deltas.calls.current;
  const perCall = callsCount > 0 ? attributedToCalls / callsCount : 0;

  return (
    <>
      <div>
        <h1 className="page-title">Performance Lab</h1>
        <div className="page-desc">
          Vraies données : collecte, ROI par action et le Pilote (IA) — période {report.periodLabel}
          .
        </div>
        <PerformanceTabs active="/performance" />
      </div>

      <PeriodFilter />

      {/* Le Pilote — IA en langage naturel sur tes données (admin uniquement) */}
      {isAdmin && <PilotePanel />}

      {/* KPIs réels sur la période */}
      <div className="kpi-grid">
        <StatCard
          label="Collecte signée (période)"
          value={money(report.deltas.collecte.current)}
          delta={report.deltas.collecte}
          unit="money"
        />
        <StatCard
          label="Appels (période)"
          value={nb(report.deltas.calls.current)}
          delta={report.deltas.calls}
        />
        <Kpi label="Souscriptions (période)" value={nb(report.totalSubs)} />
        <Kpi label="Collecte attribuée aux appels" value={money(attributedToCalls)} />
      </div>

      {/* ROI par action */}
      <div className="view-card">
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <TrendingUp size={15} />
            ROI par action (période)
          </div>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 0.8fr 1.1fr 1.1fr',
              gap: 12,
              padding: '10px 20px',
              borderBottom: '1px solid var(--border)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-4)',
            }}
          >
            <span>Action</span>
            <span style={{ textAlign: 'right' }}>Nombre</span>
            <span style={{ textAlign: 'right' }}>Collecte attribuée</span>
            <span style={{ textAlign: 'right' }}>€ / action</span>
          </div>
          <RoiRow
            icon={<Phone size={14} />}
            label="Appels"
            count={nb(callsCount)}
            amount={money(attributedToCalls)}
            per={money(perCall)}
          />
          {callsCount < 20 && (
            <div
              style={{
                margin: '10px 20px',
                padding: '8px 10px',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--warning)',
                background: 'color-mix(in srgb, var(--warning) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--warning) 24%, transparent)',
              }}
            >
              ⚠️ Échantillon faible ({nb(callsCount)} appel{callsCount > 1 ? 's' : ''} sur la
              période) : ce ROI n'est pas encore représentatif. Il se fiabilise à mesure que les
              closers enregistrent leurs appels (l'attribution ne compte que les appels passés dans
              l'outil, suivis d'une souscription sous 30 jours).
            </div>
          )}
          <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text-4)' }}>
            L'attribution Email (ouvertures / clics) s'activera dès que le webhook Brevo enverra les
            événements — la ligne Email se remplira alors automatiquement.
          </div>
        </div>
      </div>

      {/* BREACH vs Autres */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">BREACH vs autres sources</div>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          <SourceRow
            name="BREACH (tes pubs)"
            investors={breach.funnel.investors}
            collected={breach.totalInvested}
            avgTicket={breach.avgTicketPerInvestor}
            highlight
          />
          <SourceRow
            name="Autres sources"
            investors={breach.otherInvestors}
            collected={breach.otherInvested}
            avgTicket={breach.otherAvgTicketPerInvestor}
          />
        </div>
      </div>

      {/* Funnel global */}
      <div className="kpi-grid">
        <Kpi label="Investisseurs (total)" value={nb(stats.total)} />
        <Kpi label="Profil complété" value={nb(stats.registered)} />
        <Kpi label="Onboardés (KYC)" value={nb(stats.onboarded)} />
      </div>

      <Link
        href="/closing/performance"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          color: 'var(--brand)',
        }}
      >
        <LinkIcon size={14} />
        Détail par closer (page Performance closers)
      </Link>
    </>
  );
}

function RoiRow({
  icon,
  label,
  count,
  amount,
  per,
}: {
  icon: React.ReactNode;
  label: string;
  count: string;
  amount: string;
  per: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.4fr 0.8fr 1.1fr 1.1fr',
        gap: 12,
        alignItems: 'center',
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: 'var(--text-1)',
        }}
      >
        {icon}
        {label}
      </span>
      <span style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-2)' }}>{count}</span>
      <span style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}>
        {amount}
      </span>
      <span style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}>
        {per}
      </span>
    </div>
  );
}

function SourceRow({
  name,
  investors,
  collected,
  avgTicket,
  highlight,
}: {
  name: string;
  investors: number;
  collected: number;
  avgTicket: number;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.4fr 1fr 1fr 1fr',
        gap: 12,
        alignItems: 'center',
        padding: '14px 20px',
        borderBottom: '1px solid var(--border)',
        background: highlight ? 'var(--brand-bg)' : 'transparent',
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{name}</span>
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{nb(investors)} investisseurs</span>
      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{money(collected)}</span>
      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>ticket {money(avgTicket)}</span>
    </div>
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
