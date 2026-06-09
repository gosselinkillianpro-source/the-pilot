import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProjectDetail, getProjectInvestors } from '@/lib/db/queries/projects';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Brouillon', cls: 'badge badge-neutral' },
  open: { label: 'Ouvert', cls: 'badge badge-brand' },
  funding: { label: 'En collecte', cls: 'badge badge-brand' },
  funded: { label: 'Financé', cls: 'badge badge-success' },
  in_operation: { label: 'En cours', cls: 'badge badge-success' },
  repaying: { label: 'Remboursement', cls: 'badge badge-warning' },
  completed: { label: 'Terminé', cls: 'badge badge-neutral' },
  cancelled: { label: 'Annulé', cls: 'badge badge-danger' },
};

const SUB_STATUS: Record<string, string> = {
  signed: 'Signée',
  paid: 'Payée',
  active: 'Active',
  repaid: 'Remboursée',
  cancelled: 'Annulée',
};

function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}
function fmtDate(d: Date | null): string {
  return d
    ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
}

export default async function ProjectDetailPage({ params }: Props) {
  const { id } = await params;
  const project = await getProjectDetail(id);
  if (!project) notFound();
  const investors = await getProjectInvestors(id);

  const st = STATUS[project.status] ?? { label: project.status, cls: 'badge badge-neutral' };
  const progress =
    project.targetAmount && project.targetAmount > 0
      ? (project.collected / project.targetAmount) * 100
      : null;
  const avgTicket = project.investors > 0 ? project.collected / project.investors : 0;
  const breachInvestors = investors.filter((i) => i.isBreach).length;

  return (
    <>
      <Link
        href="/projects"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--text-3)',
          marginBottom: 4,
        }}
      >
        <ArrowLeft size={14} />
        Tous les projets
      </Link>

      <div>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {project.name}
          <span className={st.cls}>{st.label}</span>
        </h1>
        <div className="page-desc">
          {project.city ?? '—'}
          {project.region ? `, ${project.region}` : ''}
          {project.durationMonths ? ` · ${project.durationMonths} mois` : ''}
          {project.targetYield != null ? ` · rendement cible ${project.targetYield}%` : ''}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <Kpi label="Collecté" value={money(project.collected)} accent="var(--success)" />
        <Kpi label="Objectif" value={project.targetAmount ? money(project.targetAmount) : '—'} />
        <Kpi label="Investisseurs" value={String(project.investors)} />
        <Kpi label="Ticket moyen" value={money(avgTicket)} />
      </div>

      {progress != null && (
        <div className="view-card">
          <div
            className="view-card-body"
            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-2)' }}>Avancement de la collecte</span>
              <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>
                {Math.round(progress)} %
              </span>
            </div>
            <div style={{ height: 10, background: 'var(--glass-bg)', borderRadius: 5 }}>
              <div
                style={{
                  width: `${Math.min(100, progress)}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg,#2563EB,#7C3AED)',
                  borderRadius: 5,
                }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="split-2col">
        {/* Liste des investisseurs */}
        <div className="view-card">
          <div className="view-card-header">
            <div className="view-card-title">Investisseurs</div>
            <span className="badge badge-neutral">
              {investors.length}
              {breachInvestors > 0 ? ` · ${breachInvestors} BREACH` : ''}
            </span>
          </div>
          <div className="view-card-body" style={{ padding: 0 }}>
            <div
              className="r-stack r-head"
              style={{
                display: 'grid',
                gridTemplateColumns: '1.8fr 1fr 0.8fr 0.8fr',
                gap: 8,
                padding: '8px 20px',
                borderBottom: '1px solid var(--border)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-4)',
              }}
            >
              <span>Investisseur</span>
              <span style={{ textAlign: 'right' }}>Montant</span>
              <span style={{ textAlign: 'right' }}>Statut</span>
              <span style={{ textAlign: 'right' }}>Date</span>
            </div>
            {investors.length === 0 ? (
              <div style={{ padding: 20, fontSize: 13, color: 'var(--text-3)' }}>
                Aucun investisseur sur ce projet.
              </div>
            ) : (
              investors.map((inv, idx) => (
                <div
                  key={`${inv.investorId}-${inv.signedAt ? new Date(inv.signedAt).getTime() : 'x'}-${inv.amount}`}
                  className="r-stack"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.8fr 1fr 0.8fr 0.8fr',
                    gap: 8,
                    alignItems: 'center',
                    padding: '10px 20px',
                    borderBottom: idx < investors.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <Link
                      href={`/closing/investor/${inv.investorId}`}
                      style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}
                    >
                      {inv.fullName ?? inv.email}
                    </Link>
                    {inv.isBreach ? (
                      <span
                        className="badge"
                        style={{
                          fontSize: 9,
                          background: 'var(--ai-bg, #ede9fe)',
                          color: 'var(--ai, #7c3aed)',
                          fontWeight: 700,
                        }}
                      >
                        BREACH
                      </span>
                    ) : null}
                  </span>
                  <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 600 }}>
                    {money(inv.amount)}
                    {inv.sharesCount ? (
                      <span style={{ color: 'var(--text-4)', fontWeight: 400, fontSize: 10 }}>
                        {' '}
                        ({inv.sharesCount})
                      </span>
                    ) : null}
                  </span>
                  <span style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-3)' }}>
                    {SUB_STATUS[inv.status] ?? inv.status}
                  </span>
                  <span style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-4)' }}>
                    {fmtDate(inv.signedAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Infos projet */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="view-card">
            <div className="view-card-header">
              <div className="view-card-title">Détails</div>
            </div>
            <div
              className="view-card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <Row label="Statut" value={st.label} />
              <Row label="Ville" value={project.city ?? '—'} />
              <Row label="Région" value={project.region ?? '—'} />
              <Row
                label="Rendement cible"
                value={project.targetYield != null ? `${project.targetYield}%` : '—'}
              />
              <Row
                label="Durée"
                value={project.durationMonths ? `${project.durationMonths} mois` : '—'}
              />
              <Row label="Ouverture" value={fmtDate(project.openedAt)} />
              <Row label="Clôture collecte" value={fmtDate(project.expectedCompletionAt)} />
              <Row label="Remboursement (réel SAH)" value={fmtDate(project.repaymentDate)} />
              <Row label="Souscriptions" value={String(project.subs)} />
            </div>
          </div>

          {project.descriptionShort ? (
            <div className="view-card">
              <div className="view-card-header">
                <div className="view-card-title">Présentation</div>
              </div>
              <div className="view-card-body">
                <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
                  {project.descriptionShort}
                </p>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="view-card">
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: accent ?? 'var(--text-3)' }}>{label}</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>{value}</span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 500, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}
