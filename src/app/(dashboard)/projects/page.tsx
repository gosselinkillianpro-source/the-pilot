import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { listProjectsWithStats, type ProjectListItem } from '@/lib/db/queries/projects';

export const dynamic = 'force-dynamic';

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

function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

export default async function ProjectsPage() {
  const list = await listProjectsWithStats();
  const totalCollected = list.reduce((s, p) => s + p.collected, 0);
  const totalInvestors = list.reduce((s, p) => s + p.investors, 0);

  return (
    <>
      <div>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Building2 size={20} />
          Projets
        </h1>
        <div className="page-desc">
          {list.length} projets · {money(totalCollected)} collectés · {totalInvestors} positions
          d'investisseurs.
        </div>
      </div>

      <div className="view-card">
        <div className="view-card-body" style={{ padding: 0 }}>
          <div
            className="r-stack r-head"
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1.6fr 0.8fr 0.8fr',
              gap: 12,
              padding: '10px 20px',
              borderBottom: '1px solid var(--border)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-4)',
            }}
          >
            <span>Projet</span>
            <span>Statut</span>
            <span>Financement</span>
            <span style={{ textAlign: 'right' }}>Investisseurs</span>
            <span style={{ textAlign: 'right' }}>Rdt cible</span>
          </div>
          {list.length === 0 ? (
            <div style={{ padding: 24, fontSize: 13, color: 'var(--text-3)' }}>
              Aucun projet. Lance une synchronisation SAH.
            </div>
          ) : (
            list.map((p, idx) => <Row key={p.id} p={p} last={idx === list.length - 1} />)
          )}
        </div>
      </div>
    </>
  );
}

function Row({ p, last }: { p: ProjectListItem; last: boolean }) {
  const st = STATUS[p.status] ?? { label: p.status, cls: 'badge badge-neutral' };
  const progress =
    p.targetAmount && p.targetAmount > 0 ? (p.collected / p.targetAmount) * 100 : null;

  return (
    <Link
      href={`/projects/${p.id}`}
      className="r-stack"
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1.6fr 0.8fr 0.8fr',
        gap: 12,
        alignItems: 'center',
        padding: '14px 20px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{p.name}</span>
        <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
          {p.city ?? '—'}
          {p.durationMonths ? ` · ${p.durationMonths} mois` : ''}
        </span>
      </div>
      <span>
        <span className={st.cls} style={{ fontSize: 10 }}>
          {st.label}
        </span>
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 12, color: 'var(--text-1)' }}>
          {money(p.collected)}
          {p.targetAmount ? (
            <span style={{ color: 'var(--text-4)' }}> / {money(p.targetAmount)}</span>
          ) : null}
          {progress != null ? (
            <span style={{ color: 'var(--brand)', fontWeight: 600 }}>
              {' '}
              · {Math.round(progress)}%
            </span>
          ) : null}
        </span>
        {progress != null && (
          <div style={{ height: 5, background: 'var(--glass-bg)', borderRadius: 3 }}>
            <div
              style={{
                width: `${Math.min(100, progress)}%`,
                height: '100%',
                background:
                  progress >= 100 ? 'var(--success)' : 'linear-gradient(90deg,#2563EB,#7C3AED)',
                borderRadius: 3,
              }}
            />
          </div>
        )}
        {progress != null && p.targetAmount && p.collected < p.targetAmount ? (
          <span style={{ fontSize: 10, color: 'var(--text-4)' }}>
            reste {money(p.targetAmount - p.collected)}
          </span>
        ) : null}
      </div>
      <span style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-2)' }}>
        {p.investors}
      </span>
      <span style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-2)' }}>
        {p.targetYield != null ? `${p.targetYield}%` : '—'}
      </span>
    </Link>
  );
}
