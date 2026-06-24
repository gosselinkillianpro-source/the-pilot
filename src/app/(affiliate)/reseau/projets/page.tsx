import { FolderKanban } from 'lucide-react';
import { Card, Empty, Kpi, money, NotLinked, Table } from '@/components/affiliate/ui';
import { getAffiliateProjects, resolveAffiliateScope } from '@/lib/db/queries/affiliate';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  open: 'Ouvert',
  funding: 'En collecte',
  funded: 'Financé',
  in_operation: 'En exploitation',
  repaying: 'Remboursement',
  repaid: 'Remboursé',
  closed: 'Clôturé',
};

export default async function ProjetsPage() {
  const scope = await resolveAffiliateScope();
  if (!scope) return <NotLinked title="Projets" />;
  const projects = await getAffiliateProjects(scope.sahId);

  const total = projects.reduce((acc, p) => acc + p.networkCollected, 0);

  return (
    <>
      <div>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FolderKanban size={20} style={{ color: 'var(--ai)' }} />
          Projets
        </h1>
        <div className="page-desc">Les projets dans lesquels ton réseau a investi.</div>
      </div>

      <div className="kpi-grid">
        <Kpi label="Projets financés" value={String(projects.length)} />
        <Kpi label="Collecte du réseau" value={money(total)} accent="var(--success)" />
      </div>

      <Card title="Projets financés par le réseau">
        {projects.length === 0 ? (
          <Empty label="Le réseau n'a encore investi dans aucun projet." />
        ) : (
          <Table
            head={['Projet', 'Statut', 'Rendement', 'Investisseurs', 'Collecte réseau']}
            cols="2fr 1.1fr 1fr 1fr 1.2fr"
            rows={projects.map((p) => [
              <span key={p.id}>
                {p.name}
                {p.city ? <span style={{ color: 'var(--text-4)' }}> · {p.city}</span> : null}
              </span>,
              STATUS_LABELS[p.status] ?? p.status,
              p.yieldAnnual != null ? `${p.yieldAnnual} %` : '—',
              String(p.networkInvestors),
              money(p.networkCollected),
            ])}
          />
        )}
      </Card>
    </>
  );
}
