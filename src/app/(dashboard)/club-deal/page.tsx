import { Download } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth';
import { getClubDeal } from '@/lib/club-deal';
import { isKeyOf, PROCESSING } from '@/lib/club-deal/constants';
import { computeStats } from '@/lib/club-deal/stats';
import { getPlatformStatuses } from '@/lib/db/queries/club-deal-platform';
import { InterestList, SearchForm } from './interest-list';
import { KpiRow, ProjectsGrid, SECTION_TITLE, StatusChips, TranchesCard } from './overview';

export const dynamic = 'force-dynamic';

const READ_ROLES = ['admin', 'executive'];

/**
 * Club deal : manifestations d'intérêt reçues du formulaire de sevenathome.com.
 * Admin : suivi complet + export. Executive : lecture seule. Closers : pas d'accès.
 */
export default async function ClubDealPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!READ_ROLES.includes(user.role)) notFound();
  const canEdit = user.role === 'admin';

  const sp = await searchParams;
  const status = sp.status && isKeyOf(PROCESSING, sp.status) ? sp.status : null;
  const q = (sp.q ?? '').trim().slice(0, 120);

  const clubDeal = getClubDeal();
  const [all, rows] = await Promise.all([
    clubDeal.listAll(),
    clubDeal.list({ status, q, limit: 500 }),
  ]);
  const stats = computeStats(all);
  const platform = await getPlatformStatuses(rows.map((r) => r.email));

  const exportParams = new URLSearchParams();
  if (status) exportParams.set('status', status);
  if (q) exportParams.set('q', q);
  const exportHref = `/api/club-deal/export${exportParams.size ? `?${exportParams}` : ''}`;
  const filtered = Boolean(status || q);

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 className="page-title">Club deal</h1>
          <div className="page-desc">
            Manifestations d'intérêt reçues depuis sevenathome.com : qui veut quoi, combien, quand —
            et où en est le suivi.
          </div>
        </div>
        {canEdit && (
          <a href={exportHref} className="btn btn-secondary btn-sm" download>
            <Download size={13} />
            {filtered ? 'Exporter la sélection (CSV)' : 'Exporter en CSV'}
          </a>
        )}
      </div>

      {stats.total === 0 ? (
        <div className="view-card">
          <div className="view-card-body" style={{ fontSize: 13, color: 'var(--text-3)' }}>
            Aucune manifestation d'intérêt pour l'instant. Elles arrivent ici dès que le formulaire
            club deal du site est envoyé (route publique <code>/api/club-deal</code>).
          </div>
        </div>
      ) : (
        <>
          <KpiRow stats={stats} />

          <ProjectsGrid stats={stats} />

          <section aria-labelledby="cd-tranches">
            <h2 id="cd-tranches" style={SECTION_TITLE}>
              Tranches
            </h2>
            <TranchesCard stats={stats} />
          </section>

          <section
            id="liste"
            aria-labelledby="cd-list"
            style={{ display: 'flex', flexDirection: 'column', gap: 10, scrollMarginTop: 80 }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <h2 id="cd-list" style={{ ...SECTION_TITLE, margin: 0 }}>
                Demandes{' '}
                <span style={{ color: 'var(--text-4)', fontWeight: 500 }}>
                  · {rows.length}
                  {filtered ? ` sur ${stats.total}` : ''}
                </span>
              </h2>
              <SearchForm q={q} status={status} />
            </div>
            <StatusChips stats={stats} current={status} q={q} />
            <InterestList rows={rows} platform={platform} canEdit={canEdit} />
          </section>
        </>
      )}
    </>
  );
}
