import { Search, Users } from 'lucide-react';
import Link from 'next/link';
import { getInvestorStats, type InvestorListItem, listInvestors } from '@/lib/db/queries/investors';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

function nb(n: number): string {
  return n.toLocaleString('fr-FR');
}

function initials(item: InvestorListItem): string {
  const base = item.fullName ?? item.email;
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  return `${parts[0]?.[0] ?? '?'}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; offset?: string }>;
}) {
  const { q, offset: offsetParam } = await searchParams;
  const query = q?.trim() ?? '';
  const offset = Math.max(0, Number.parseInt(offsetParam ?? '0', 10) || 0);

  const [{ rows, total }, stats] = await Promise.all([
    listInvestors({ search: query, offset, limit: PAGE_SIZE }),
    getInvestorStats(),
  ]);

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
          <h1 className="page-title">Investisseurs</h1>
          <div className="page-desc">
            {query
              ? `Recherche : « ${query} »`
              : `${nb(stats.total)} investisseurs synchronisés depuis Seven At Home`}
          </div>
        </div>
      </div>

      {/* KPIs réels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <Kpi label="Investisseurs" value={nb(stats.total)} sub="inscrits" />
        <Kpi label="Profil complet" value={nb(stats.registered)} sub="profil validé" />
        <Kpi label="Onboardés (KYC)" value={nb(stats.onboarded)} sub="identité validée" />
      </div>

      {/* Recherche */}
      <form
        method="get"
        action="/closing/pipeline"
        style={{ display: 'flex', gap: 8, maxWidth: 420 }}
      >
        <input
          name="q"
          defaultValue={query}
          className="input"
          placeholder="Rechercher par nom ou email…"
        />
        <button type="submit" className="btn btn-secondary btn-sm" aria-label="Rechercher">
          <Search size={14} />
        </button>
      </form>

      {/* Liste */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Liste</div>
          <span className="badge badge-neutral">{nb(total)} résultats</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1.4fr 1fr 200px',
              gap: 12,
              padding: '10px 20px',
              borderBottom: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-4)',
            }}
          >
            <span>Nom</span>
            <span>Email</span>
            <span>Ville</span>
            <span style={{ textAlign: 'right' }}>Statut</span>
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: '24px 20px', fontSize: 13, color: 'var(--text-3)' }}>
              Aucun investisseur{query ? ' pour cette recherche' : ''}.
            </div>
          ) : (
            rows.map((inv, idx) => (
              <Link
                key={inv.id}
                href={`/closing/investor/${inv.id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 1.4fr 1fr 200px',
                  gap: 12,
                  alignItems: 'center',
                  padding: '12px 20px',
                  borderBottom: idx < rows.length - 1 ? '1px solid var(--border)' : 'none',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span className="avatar avatar-sm avatar-blue" style={{ flexShrink: 0 }}>
                    {initials(inv)}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: 'var(--text-1)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {inv.fullName ?? '—'}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--text-3)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {inv.email}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {inv.addressCity ?? '—'}
                </span>
                <span
                  style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}
                >
                  {inv.onboardingComplete ? (
                    <span className="badge badge-success badge-dot">Onboardé</span>
                  ) : inv.registrationComplete ? (
                    <span className="badge badge-brand">Profil complet</span>
                  ) : (
                    <span className="badge badge-neutral">Inscrit</span>
                  )}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Pagination */}
      {!query && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {total === 0 ? '0' : `${offset + 1}–${offset + rows.length}`} sur {nb(total)}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {offset > 0 && (
              <Link
                href={`/closing/pipeline?offset=${Math.max(0, offset - PAGE_SIZE)}`}
                className="btn btn-secondary btn-sm"
              >
                Précédent
              </Link>
            )}
            {offset + PAGE_SIZE < total && (
              <Link
                href={`/closing/pipeline?offset=${offset + PAGE_SIZE}`}
                className="btn btn-secondary btn-sm"
              >
                Suivant
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="kpi-hero">
      <div className="kpi-hero-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Users size={14} />
        {label}
      </div>
      <div className="kpi-hero-value">{value}</div>
      <div className="kpi-hero-trend">
        <span>{sub}</span>
      </div>
    </div>
  );
}
