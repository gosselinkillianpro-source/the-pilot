import { BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { Card, Empty, Kpi, money, NotLinked, pct, Table } from '@/components/affiliate/ui';
import { getAffiliateStats, resolveAffiliateScope } from '@/lib/db/queries/affiliate';

export const dynamic = 'force-dynamic';

export default async function VueEnsemblePage() {
  const scope = await resolveAffiliateScope();
  if (!scope) return <NotLinked title="Vue d'ensemble" />;
  const s = await getAffiliateStats(scope.sahId);

  const funnel = [
    { label: 'Membres du réseau', value: s.totalMembers },
    { label: 'Profil complété', value: s.registered },
    { label: 'Onboardés (KYC)', value: s.onboarded },
    { label: 'Investisseurs', value: s.investors },
  ];

  return (
    <>
      <div>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 size={20} style={{ color: 'var(--ai)' }} />
          Vue d'ensemble
        </h1>
        <div className="page-desc">L'activité complète de ton réseau d'affiliation.</div>
      </div>

      <div className="kpi-grid">
        <Kpi label="Membres du réseau" value={String(s.totalMembers)} />
        <Kpi label="Onboardés" value={`${s.onboarded} · ${pct(s.onboarded, s.totalMembers)}`} />
        <Kpi label="Investisseurs" value={String(s.investors)} />
        <Kpi label="Collecte du réseau" value={money(s.totalInvested)} accent="var(--success)" />
      </div>

      <div className="kpi-grid">
        <Kpi label="Ticket moyen / investisseur" value={money(s.avgTicketPerInvestor)} />
        <Kpi label="Montant moyen / souscription" value={money(s.avgPerSub)} />
        <Kpi label="Souscriptions" value={String(s.subCount)} />
        <Kpi label="Nouveaux (30 j)" value={String(s.new30d)} accent="var(--brand)" />
      </div>

      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Entonnoir du réseau</div>
        </div>
        <div
          className="view-card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {funnel.map((st) => {
            const width = s.totalMembers > 0 ? Math.max(3, (st.value / s.totalMembers) * 100) : 0;
            return (
              <div key={st.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-2)' }}>{st.label}</span>
                  <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>
                    {st.value}{' '}
                    <span style={{ color: 'var(--text-4)' }}>
                      ({pct(st.value, s.totalMembers)})
                    </span>
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
        </div>
      </div>

      <div className="grid-2">
        <Card title="Par niveau">
          {s.byLevel.length === 0 ? (
            <Empty label="Aucun filleul pour l'instant." />
          ) : (
            <Table
              head={['Niveau', 'Membres', 'Onboardés', 'Collecte']}
              rows={s.byLevel.map((l) => [
                l.label,
                String(l.members),
                String(l.onboarded),
                money(l.invested),
              ])}
            />
          )}
        </Card>

        <Card
          title="Top projets du réseau"
          action={
            <Link href="/reseau/projets" style={{ fontSize: 12, color: 'var(--brand)' }}>
              Tout voir
            </Link>
          }
        >
          {s.topProjects.length === 0 ? (
            <Empty />
          ) : (
            <Table
              head={['Projet', 'Investisseurs', 'Collecte']}
              rows={s.topProjects.map((p) => [p.name, String(p.investors), money(p.collected)])}
            />
          )}
        </Card>
      </div>
    </>
  );
}
