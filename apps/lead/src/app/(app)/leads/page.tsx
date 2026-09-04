import { Search, SlidersHorizontal } from 'lucide-react';
import { LeadFiche } from '@/components/leads/lead-fiche';
import { LeadsTable } from '@/components/leads/leads-table';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs } from '@/components/ui/tabs';
import { getAuthenticatedUser } from '@/lib/auth';
import type { LeadState } from '@/lib/domain/state-machine';
import { countLeadsByState, getLeadDetail, listLeads } from '@/lib/leads/queries';

export const dynamic = 'force-dynamic';

const TABS: { key: string; label: string; states?: LeadState[] }[] = [
  { key: 'tous', label: 'Tous' },
  {
    key: 'a-rappeler',
    label: 'À rappeler',
    states: ['a_rappeler', 'a_rappeler_plus_tard', 'en_appel'],
  },
  {
    key: 'rdv',
    label: 'RDV posés',
    states: ['qualifie', 'rdv_pose', 'honore', 'conforme', 'en_cours', 'signe'],
  },
  { key: 'nourrir', label: 'À nourrir', states: ['a_nourrir'] },
  { key: 'hors-cible', label: 'Hors cible', states: ['hors_cible'] },
  { key: 'injoignables', label: 'Injoignables', states: ['injoignable'] },
  {
    key: 'perdus',
    label: 'Absents / perdus',
    states: ['absent', 'non_conforme', 'retour_accepte', 'retour_refuse', 'perdu', 'reprogramme'],
  },
];

type LeadsSearch = { tab?: string; q?: string; lead?: string; page?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<LeadsSearch> }) {
  const sp = await searchParams;
  const user = await getAuthenticatedUser();
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const limit = 50;
  const [counts, result, detail] = await Promise.all([
    countLeadsByState(user),
    listLeads(user, { state: tab?.states, q: sp.q, limit, offset: (page - 1) * limit }),
    sp.lead && /^[0-9a-f-]{36}$/i.test(sp.lead)
      ? getLeadDetail(user, sp.lead)
      : Promise.resolve(null),
  ]);
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const countFor = (states?: LeadState[]) =>
    states ? states.reduce((a, s) => a + (counts[s] ?? 0), 0) : total;
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { tab: sp.tab, q: sp.q, page: sp.page, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/leads?${s}` : '/leads';
  };

  return (
    <>
      <PageHeader title="Leads" count={result.total} />
      <Tabs
        items={TABS.map((t) => ({
          href: qs({ tab: t.key === 'tous' ? undefined : t.key, page: undefined }),
          label: t.label,
          count: countFor(t.states),
          active: t.key === tab?.key,
        }))}
      />
      <div className="toolbar">
        <form action="/leads" method="get" className="search">
          {sp.tab ? <input type="hidden" name="tab" value={sp.tab} /> : null}
          <Search size={16} />
          <input
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="Prénom, email, téléphone"
            aria-label="Rechercher"
          />
        </form>
        <span className="icon-btn" title="Filtres à venir">
          <SlidersHorizontal />
        </span>
        {sp.q ? (
          <a href={qs({ q: undefined, page: undefined })} className="hint">
            Effacer la recherche
          </a>
        ) : null}
      </div>
      {result.items.length ? (
        <LeadsTable items={result.items} baseHref={qs({})} isAdmin={user.role === 'admin'} />
      ) : (
        <div className="card">
          <EmptyState title="Aucun lead ici">
            {sp.q ? 'Aucun résultat pour cette recherche.' : 'Rien dans cet onglet pour l’instant.'}
          </EmptyState>
        </div>
      )}
      {result.total > limit ? (
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12, gap: 8 }}>
          {page > 1 ? (
            <a className="btn btn-secondary btn-sm" href={qs({ page: String(page - 1) })}>
              Précédent
            </a>
          ) : null}
          <span className="hint">
            Page {page} / {Math.ceil(result.total / limit)}
          </span>
          {page * limit < result.total ? (
            <a className="btn btn-secondary btn-sm" href={qs({ page: String(page + 1) })}>
              Suivant
            </a>
          ) : null}
        </div>
      ) : null}
      {detail ? (
        <Drawer
          title="Fiche d’appel"
          closeHref={qs({ lead: undefined })}
          openHref={`/leads/${detail.lead.id}`}
        >
          <LeadFiche detail={detail} user={user} variant="drawer" />
        </Drawer>
      ) : null}
    </>
  );
}
