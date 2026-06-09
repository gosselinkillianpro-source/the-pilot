import { Target } from 'lucide-react';
import { PeriodFilter } from '@/components/shared/period-filter';
import { StatCard } from '@/components/shared/stat-card';
import { getBreachStats } from '@/lib/db/queries/closing';
import { resolvePeriod } from '@/lib/period';

export const dynamic = 'force-dynamic';

function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}
function pct(n: number, d: number): string {
  if (d <= 0) return '—';
  return `${Math.round((n / d) * 100)} %`;
}

export default async function BreachPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const stats = await getBreachStats(period);
  const f = stats.funnel;
  const maxMonth = Math.max(1, ...stats.byMonth.map((m) => m.signups));

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
          Tout ce qu'on sait des personnes venues de tes pubs (code bonus contenant « BREACH »). Du
          clic à la souscription, pour piloter tes décisions.
        </div>
      </div>

      {/* Filtre de date (préréglages + plage personnalisée) */}
      <PeriodFilter />

      {/* KPIs principaux (tout temps) */}
      <div className="kpi-grid">
        <Kpi label="Leads BREACH" value={String(f.total)} />
        <Kpi label="Onboardés" value={`${f.onboarded} · ${pct(f.onboarded, f.total)}`} />
        <Kpi label="Investisseurs" value={String(f.investors)} />
        <Kpi label="Collecte BREACH" value={money(stats.totalInvested)} accent="var(--success)" />
      </div>

      <div className="kpi-grid">
        <Kpi label="Ticket moyen / investisseur" value={money(stats.avgTicketPerInvestor)} />
        <Kpi label="Montant moyen / souscription" value={money(stats.avgPerSub)} />
        <Kpi
          label="Délai inscription → 1er invest."
          value={stats.avgDaysToFirstSub != null ? `${stats.avgDaysToFirstSub} j` : '—'}
        />
        <Kpi label="Solde portefeuilles (cumul)" value={money(stats.walletTotal)} />
      </div>

      <div className="kpi-grid">
        <Kpi label="Nouveaux (7 jours)" value={String(f.new7d)} accent="var(--brand)" />
        <Kpi label="Nouveaux (30 jours)" value={String(f.new30d)} accent="var(--brand)" />
        <Kpi label="Souscriptions (total)" value={String(stats.subCount)} />
      </div>

      {/* Évolution sur la période choisie vs période précédente équivalente */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Sur la période · gain/perte vs période précédente</div>
        </div>
        <div
          className="view-card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div className="kpi-grid">
            <StatCard
              label="Nouveaux leads"
              value={String(stats.period.leads.current)}
              delta={stats.period.leads}
            />
            <StatCard
              label="Collecte"
              value={money(stats.period.collecte.current)}
              delta={stats.period.collecte}
              unit="money"
            />
            <StatCard
              label="Souscriptions"
              value={String(stats.period.subs.current)}
              delta={stats.period.subs}
            />
            <StatCard
              label="Investisseurs"
              value={String(stats.period.investors.current)}
              delta={stats.period.investors}
            />
            <StatCard
              label="Ticket moyen / inv."
              value={money(stats.period.avgTicket.current)}
              delta={stats.period.avgTicket}
              unit="money"
            />
            <StatCard
              label="Montant moyen / souscr."
              value={money(stats.period.avgPerSub.current)}
              delta={stats.period.avgPerSub}
              unit="money"
            />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-4)', margin: 0 }}>
            Période : {stats.period.label} · comparée à la période précédente équivalente. Leads =
            date d'inscription ; collecte/souscriptions = date de signature.
          </p>
        </div>
      </div>

      {/* Funnel + comparaison */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Funnel BREACH</div>
        </div>
        <div
          className="view-card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {steps.map((st) => {
            const width = f.total > 0 ? Math.max(3, (st.value / f.total) * 100) : 0;
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
            Onboarding BREACH <strong>{pct(f.onboarded, f.total)}</strong> vs hors BREACH{' '}
            <strong>{pct(stats.otherOnboarded, stats.otherTotal)}</strong> · Ticket moyen BREACH{' '}
            <strong>{money(stats.avgTicketPerInvestor)}</strong> vs hors BREACH{' '}
            <strong>{money(stats.otherAvgTicketPerInvestor)}</strong>.
          </p>
        </div>
      </div>

      {/* Nouveaux par mois */}
      {stats.byMonth.length > 0 && (
        <div className="view-card">
          <div className="view-card-header">
            <div className="view-card-title">Nouveaux inscrits BREACH par mois</div>
          </div>
          <div
            className="view-card-body"
            style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 140 }}
          >
            {stats.byMonth.map((m) => (
              <div
                key={m.month}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>
                  {m.signups}
                </span>
                <div
                  style={{
                    width: '100%',
                    height: `${(m.signups / maxMonth) * 90}px`,
                    minHeight: 4,
                    background: 'linear-gradient(180deg,#7C3AED,#2563EB)',
                    borderRadius: 6,
                  }}
                />
                <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{m.month}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid-2">
        {/* Par code bonus */}
        <Card title="Par code bonus">
          <Table
            head={['Code', 'Leads', 'Onb.', 'Collecte']}
            rows={stats.byCode.map((c) => [
              c.code,
              String(c.total),
              `${c.onboarded} (${pct(c.onboarded, c.total)})`,
              money(c.invested),
            ])}
          />
        </Card>

        {/* Top villes */}
        <Card title="Top villes">
          {stats.byCity.length === 0 ? (
            <Empty />
          ) : (
            <Table
              head={['Ville', 'Leads']}
              rows={stats.byCity.map((c) => [c.city, String(c.total)])}
            />
          )}
        </Card>
      </div>

      {/* Projets financés par les leads BREACH */}
      <Card title="Projets financés par mes leads">
        {stats.topProjects.length === 0 ? (
          <Empty />
        ) : (
          <Table
            head={['Projet', 'Investisseurs', 'Collecte']}
            rows={stats.topProjects.map((p) => [p.name, String(p.investors), money(p.collected)])}
          />
        )}
      </Card>
    </>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="view-card">
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: accent ?? 'var(--text-3)' }}>{label}</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>{value}</span>
      </div>
    </div>
  );
}

/** KPI avec annotation d'évolution mois courant vs mois précédent. */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title">{title}</div>
      </div>
      <div className="view-card-body" style={{ padding: 0 }}>
        {children}
      </div>
    </div>
  );
}

function Empty() {
  return <div style={{ padding: 20, fontSize: 13, color: 'var(--text-3)' }}>Aucune donnée.</div>;
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  const cols = `2fr ${head
    .slice(1)
    .map(() => '1fr')
    .join(' ')}`;
  return (
    <>
      <div
        className="r-stack r-head"
        style={{
          display: 'grid',
          gridTemplateColumns: cols,
          gap: 8,
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--text-4)',
        }}
      >
        {head.map((h, i) => (
          <span key={h} style={{ textAlign: i === 0 ? 'left' : 'right' }}>
            {h}
          </span>
        ))}
      </div>
      {rows.map((r, idx) => {
        const rowKey = r.join('|');
        return (
          <div
            key={rowKey}
            className="r-stack"
            style={{
              display: 'grid',
              gridTemplateColumns: cols,
              gap: 8,
              padding: '10px 16px',
              borderBottom: idx < rows.length - 1 ? '1px solid var(--border)' : 'none',
              fontSize: 12,
            }}
          >
            {r.map((cell, i) => (
              <span
                key={`${rowKey}-${head[i]}`}
                style={{
                  textAlign: i === 0 ? 'left' : 'right',
                  color: i === 0 ? 'var(--text-1)' : 'var(--text-2)',
                  fontWeight: i === 0 ? 600 : 400,
                }}
              >
                {cell}
              </span>
            ))}
          </div>
        );
      })}
    </>
  );
}
