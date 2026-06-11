import { eq } from 'drizzle-orm';
import { Building2, Target, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import { PeriodFilter } from '@/components/shared/period-filter';
import { StatCard } from '@/components/shared/stat-card';
import { getAuthenticatedUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getGlobalStats } from '@/lib/db/queries/dashboard';
import { users } from '@/lib/db/schema';
import { resolvePeriod } from '@/lib/period';
import { CollecteChart } from './collecte-chart';

export const dynamic = 'force-dynamic';

function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}
function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

/** Prénom de l'utilisateur connecté (nom en base, sinon début de l'email).
 *  Jamais le nom d'un autre : repli neutre si rien d'exploitable. */
async function getFirstName(userId: string, email: string): Promise<string> {
  let fullName: string | null = null;
  try {
    const row = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    fullName = row[0]?.fullName ?? null;
  } catch {
    // best-effort : pas de nom => repli sur l'email
  }
  const source = (fullName?.trim() || email.split('@')[0] || '').trim();
  const first = source.split(/[\s._-]+/)[0] ?? '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const user = await getAuthenticatedUser();
  const period = resolvePeriod(await searchParams);
  const [stats, firstName] = await Promise.all([
    getGlobalStats(period),
    getFirstName(user.id, user.email),
  ]);
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const onbRate = pct(stats.investors.onboarded, stats.investors.total);

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
          <h1 className="page-title">{firstName ? `Bonjour ${firstName}` : 'Bonjour 👋'}</h1>
          <div className="page-desc">
            {today.charAt(0).toUpperCase() + today.slice(1)} ·{' '}
            {stats.investors.total.toLocaleString('fr-FR')} investisseurs ·{' '}
            {money(stats.collecte.total)} collectés
          </div>
        </div>
      </div>

      {/* KPIs — données réelles SAH */}
      <div className="kpi-grid">
        <Kpi label="Collecte totale" value={money(stats.collecte.total)} sub="hors annulées" />
        <Kpi label="Collecte ce mois" value={money(stats.collecte.month)} sub="mois en cours" />
        <Kpi
          label="Investisseurs"
          value={stats.investors.total.toLocaleString('fr-FR')}
          sub={`${stats.collecte.investors} ont investi`}
        />
        <Kpi
          label="Onboardés (KYC)"
          value={`${onbRate} %`}
          sub={`${stats.investors.onboarded} pers.`}
        />
      </div>
      <div className="kpi-grid">
        <Kpi
          label="Souscriptions"
          value={stats.collecte.subs.toLocaleString('fr-FR')}
          sub="hors annulées"
        />
        <Kpi
          label="Ticket moyen / inv."
          value={money(stats.collecte.avgTicket)}
          sub="cumulé par personne"
        />
        <Kpi
          label="Projets ouverts"
          value={`${stats.projects.open} / ${stats.projects.total}`}
          sub="en collecte / total"
        />
        <Kpi
          label="Leads BREACH"
          value={stats.breachLeads.toLocaleString('fr-FR')}
          sub={`${money(stats.breachCollecte)} collectés`}
        />
      </div>

      {/* Filtre de date + évolution sur la période */}
      <div className="view-card">
        <div
          className="view-card-header"
          style={{ flexWrap: 'wrap', gap: 10, alignItems: 'center' }}
        >
          <div className="view-card-title">Sur la période · gain/perte vs période précédente</div>
          <PeriodFilter />
        </div>
        <div className="view-card-body">
          <div className="kpi-grid">
            <StatCard
              label="Nouveaux inscrits"
              value={stats.period.leads.current.toLocaleString('fr-FR')}
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
              value={stats.period.subs.current.toLocaleString('fr-FR')}
              delta={stats.period.subs}
            />
            <StatCard
              label="Investisseurs"
              value={stats.period.investors.current.toLocaleString('fr-FR')}
              delta={stats.period.investors}
            />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-4)', margin: '10px 0 0' }}>
            Période : {stats.period.label} · comparée à la période précédente équivalente.
          </p>
        </div>
      </div>

      {/* Graphique interactif + funnel */}
      <div className="split-2col">
        <CollecteChart data={stats.byMonth} />

        <div className="view-card">
          <div className="view-card-header">
            <div className="view-card-title">Funnel d'inscription</div>
            <Link href="/closing/pipeline" className="btn btn-ghost btn-sm">
              Détail
            </Link>
          </div>
          <div
            className="view-card-body"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <FunnelRow
              label="Inscrits"
              value={stats.investors.total}
              total={stats.investors.total}
            />
            <FunnelRow
              label="Profil complété"
              value={stats.investors.registered}
              total={stats.investors.total}
              prevValue={stats.investors.total}
              prevLabel="inscrits"
            />
            <FunnelRow
              label="Onboardés (KYC)"
              value={stats.investors.onboarded}
              total={stats.investors.total}
              prevValue={stats.investors.registered}
              prevLabel="profils complétés"
            />
            <FunnelRow
              label="Ont investi"
              value={stats.collecte.investors}
              total={stats.investors.total}
              prevValue={stats.investors.onboarded}
              prevLabel="onboardés"
            />
          </div>
        </div>
      </div>

      {/* Top projets cliquables + accès rapides */}
      <div className="split-2col">
        <div className="view-card">
          <div className="view-card-header">
            <div className="view-card-title">Top projets par collecte</div>
            <Link href="/projects" className="btn btn-ghost btn-sm">
              Tous les projets
            </Link>
          </div>
          <div className="view-card-body" style={{ padding: 0 }}>
            {stats.topProjects.length === 0 ? (
              <div style={{ padding: 20, fontSize: 13, color: 'var(--text-3)' }}>
                Aucun projet (lance une synchro).
              </div>
            ) : (
              stats.topProjects.map((p, idx) => {
                const max = Math.max(1, ...stats.topProjects.map((x) => x.collected));
                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 5,
                      padding: '12px 20px',
                      borderBottom:
                        idx < stats.topProjects.length - 1 ? '1px solid var(--border)' : 'none',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{p.name}</span>
                      <span style={{ color: 'var(--text-3)' }}>
                        {money(p.collected)} · {p.investors} inv.
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--glass-bg)', borderRadius: 999 }}>
                      <div
                        style={{
                          width: `${Math.max(2, (p.collected / max) * 100)}%`,
                          height: '100%',
                          borderRadius: 999,
                          background: 'linear-gradient(90deg,#2563EB,#7C3AED)',
                        }}
                      />
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <div className="view-card">
          <div className="view-card-header">
            <div className="view-card-title">Accès rapides</div>
          </div>
          <div
            className="view-card-body"
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <QuickLink
              href="/closing"
              icon={<Users size={15} />}
              label="File d'appels"
              hint={`${stats.investors.new7d} nouveaux (7 j)`}
            />
            <QuickLink
              href="/projects"
              icon={<Building2 size={15} />}
              label="Projets"
              hint={`${stats.projects.open} en collecte`}
            />
            <QuickLink
              href="/breach"
              icon={<Target size={15} />}
              label="BREACH (mes pubs)"
              hint={`${stats.breachLeads} leads`}
            />
            <QuickLink
              href="/closing/performance"
              icon={<TrendingUp size={15} />}
              label="Performance closers"
              hint="appels & conversions"
            />
          </div>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi-hero">
      <div className="kpi-hero-label">{label}</div>
      <div className="kpi-hero-value">{value}</div>
      {sub ? <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div> : null}
    </div>
  );
}

function FunnelRow({
  label,
  value,
  total,
  prevValue,
  prevLabel,
}: {
  label: string;
  value: number;
  total: number;
  prevValue?: number;
  prevLabel?: string;
}) {
  const ratio = total > 0 ? value / total : 0;
  // Taux de passage depuis l'étape précédente (révèle la déperdition).
  const stepRate = prevValue && prevValue > 0 ? Math.round((value / prevValue) * 100) : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: 'var(--text-2)' }}>{label}</span>
        <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>
          {value.toLocaleString('fr-FR')}{' '}
          <span style={{ color: 'var(--text-4)', fontWeight: 400 }}>
            ({Math.round(ratio * 100)}%)
          </span>
        </span>
      </div>
      <div style={{ height: 6, background: 'var(--glass-bg)', borderRadius: 999 }}>
        <div
          style={{
            width: `${Math.max(2, ratio * 100)}%`,
            height: '100%',
            borderRadius: 999,
            background: 'linear-gradient(90deg,#2563EB,#7C3AED)',
          }}
        />
      </div>
      {stepRate !== null && prevLabel ? (
        <span style={{ fontSize: 10, color: 'var(--text-4)' }}>
          → {stepRate}% des {prevLabel}
        </span>
      ) : null}
    </div>
  );
}

function QuickLink({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <span style={{ color: 'var(--brand)' }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>
        {label}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{hint}</span>
    </Link>
  );
}
