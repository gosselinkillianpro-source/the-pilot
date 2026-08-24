import { Search } from 'lucide-react';
import Link from 'next/link';
import { getAuthenticatedUser } from '@/lib/auth';
import { type InvestorListRow, listInvestorsFiltered } from '@/lib/db/queries/investor-list';
import { getInvestorStage } from '@/lib/investor-stage';
import { DEFAULT_VIEW, getView, resolveFilters, type ViewKey } from '@/lib/investor-views';
import { ViewTabs } from './view-tabs';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

function nb(n: number): string {
  return n.toLocaleString('fr-FR');
}

function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

function initials(row: InvestorListRow): string {
  const base = row.fullName ?? row.email;
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  return `${parts[0]?.[0] ?? '?'}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

function shortDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}

/** Colonnes de droite : elles changent selon ce que la vue cherche à montrer. */
function TrailingCells({ row, view }: { row: InvestorListRow; view: ViewKey }) {
  if (view === 'reinvest') {
    const d = row.daysUntilRepayment;
    const tone =
      d == null
        ? 'badge-neutral'
        : d <= 14
          ? 'badge-danger'
          : d <= 30
            ? 'badge-warning'
            : 'badge-neutral';
    return (
      <>
        <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}>
          {money(row.totalInvested)}
        </span>
        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {shortDate(row.nextRepayment)}
          </span>
          {d != null && <span className={`badge ${tone}`}>J-{d}</span>}
        </span>
      </>
    );
  }

  if (view === 'portefeuille') {
    const late = row.nextActionAt != null && row.nextActionAt.getTime() < Date.now();
    return (
      <>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {row.lastCallAt ? shortDate(row.lastCallAt) : 'Jamais appelé'}
        </span>
        <span
          style={{
            fontSize: 12,
            textAlign: 'right',
            color: late ? 'var(--danger)' : 'var(--text-3)',
            fontWeight: late ? 600 : 400,
          }}
        >
          {row.nextActionAt ? `${late ? '⏰ ' : ''}${shortDate(row.nextActionAt)}` : '—'}
        </span>
      </>
    );
  }

  const stage = getInvestorStage(row);
  return (
    <>
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
        {row.totalInvested > 0 ? money(row.totalInvested) : '—'}
      </span>
      <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {row.isBreach && <span className="badge badge-brand">BREACH</span>}
        <span className={stage.badgeClass}>{stage.label}</span>
      </span>
    </>
  );
}

function trailingHeaders(view: ViewKey): [string, string] {
  if (view === 'reinvest') return ['Capital', 'Échéance'];
  if (view === 'portefeuille') return ['Dernier appel', 'Prochaine action'];
  return ['Investi', 'Statut'];
}

export default async function InvestisseursPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; q?: string; offset?: string }>;
}) {
  const params = await searchParams;
  const user = await getAuthenticatedUser();

  const view = getView(params.vue ?? DEFAULT_VIEW);
  const query = params.q?.trim() ?? '';
  const offset = Math.max(0, Number.parseInt(params.offset ?? '0', 10) || 0);

  const filters = resolveFilters(view, { search: query || undefined }, user.id);
  const { rows, total } = await listInvestorsFiltered({
    ...filters,
    limit: PAGE_SIZE,
    offset,
  });

  const [thA, thB] = trailingHeaders(view.key);
  const columns = '1.5fr 1.4fr 0.9fr 0.9fr 190px';

  /** Conserve la vue et la recherche en changeant de page. */
  const pageHref = (o: number) => {
    const p = new URLSearchParams();
    p.set('vue', view.key);
    if (query) p.set('q', query);
    if (o > 0) p.set('offset', String(o));
    return `/closing/investisseurs?${p.toString()}`;
  };

  return (
    <>
      <div>
        <h1 className="page-title">Investisseurs</h1>
        <div className="page-desc">{view.description}</div>
      </div>

      <ViewTabs active={view.key} query={query} />

      <form
        action="/closing/investisseurs"
        method="get"
        style={{ display: 'flex', gap: 8, alignItems: 'center' }}
      >
        <input type="hidden" name="vue" value={view.key} />
        <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-4)',
            }}
          />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Nom ou e-mail…"
            className="input"
            style={{ width: '100%', paddingLeft: 30 }}
          />
        </div>
        <button type="submit" className="btn btn-secondary btn-sm">
          Rechercher
        </button>
        {query && (
          <Link href={pageHref(0)} className="btn btn-ghost btn-sm">
            Effacer
          </Link>
        )}
      </form>

      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">
            {nb(total)} {total > 1 ? 'personnes' : 'personne'}
          </div>
        </div>

        <div className="view-card-body" style={{ padding: 0 }}>
          <div
            className="r-stack r-head"
            style={{
              display: 'grid',
              gridTemplateColumns: columns,
              gap: 12,
              padding: '10px 20px',
              borderBottom: '1px solid var(--border)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-4)',
            }}
          >
            <span>Nom</span>
            <span>Email</span>
            <span>Ville</span>
            <span>{thA}</span>
            <span style={{ textAlign: 'right' }}>{thB}</span>
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: '24px 20px', fontSize: 13, color: 'var(--text-3)' }}>
              Aucun investisseur dans cette vue
              {query ? ' pour cette recherche' : ''}.
            </div>
          ) : (
            rows.map((row, idx) => (
              <Link
                key={row.id}
                href={`/closing/investor/${row.id}`}
                className="r-stack"
                style={{
                  display: 'grid',
                  gridTemplateColumns: columns,
                  gap: 12,
                  alignItems: 'center',
                  padding: '12px 20px',
                  borderBottom: idx < rows.length - 1 ? '1px solid var(--border)' : 'none',
                  textDecoration: 'none',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: 'var(--glass-bg-strong)',
                      border: '1px solid var(--border)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--text-3)',
                      flexShrink: 0,
                    }}
                  >
                    {initials(row)}
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
                    {row.fullName ?? '—'}
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
                  {row.email}
                </span>

                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{row.city ?? '—'}</span>

                <TrailingCells row={row} view={view.key} />
              </Link>
            ))
          )}
        </div>
      </div>

      {total > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {total === 0 ? '0' : `${offset + 1}–${offset + rows.length}`} sur {nb(total)}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {offset > 0 && (
              <Link
                href={pageHref(Math.max(0, offset - PAGE_SIZE))}
                className="btn btn-secondary btn-sm"
              >
                Précédent
              </Link>
            )}
            {offset + rows.length < total && (
              <Link href={pageHref(offset + PAGE_SIZE)} className="btn btn-secondary btn-sm">
                Suivant
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
