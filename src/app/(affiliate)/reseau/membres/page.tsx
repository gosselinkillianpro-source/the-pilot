import { Phone, Search, Users2 } from 'lucide-react';
import Link from 'next/link';
import {
  Card,
  Empty,
  Kpi,
  money,
  NotLinked,
  stageLabel,
  statusLabel,
  Table,
} from '@/components/affiliate/ui';
import { getAffiliateMembers, resolveAffiliateScope } from '@/lib/db/queries/affiliate';

export const dynamic = 'force-dynamic';

function fmtDate(s: string | null): string {
  return s ? s.slice(0, 10) : '—';
}

export default async function MembresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const scope = await resolveAffiliateScope();
  if (!scope) return <NotLinked title="Mon réseau" />;
  const { q } = await searchParams;
  const query = q?.trim() ?? '';
  const members = await getAffiliateMembers(scope.sahId, query);

  const invested = members.filter((m) => m.invested > 0).length;

  return (
    <>
      <div>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users2 size={20} style={{ color: 'var(--ai)' }} />
          Mon réseau
        </h1>
        <div className="page-desc">
          Tous tes filleuls, par niveau. Clique pour ouvrir une fiche.
        </div>
      </div>

      {/* Recherche nom / email / téléphone (scopée au réseau) */}
      <form method="get" style={{ display: 'flex', gap: 8 }}>
        <div
          className="view-topbar-search"
          style={{ flex: 1, maxWidth: 420, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Search size={14} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Rechercher un membre (nom, email, téléphone)…"
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-1)',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>
        <button type="submit" className="btn btn-secondary btn-sm">
          Rechercher
        </button>
        {query ? (
          <Link href="/reseau/membres" className="btn btn-secondary btn-sm">
            Effacer
          </Link>
        ) : null}
      </form>

      <div className="kpi-grid">
        <Kpi label={query ? 'Résultats' : 'Membres'} value={String(members.length)} />
        <Kpi label="Investisseurs" value={String(invested)} accent="var(--success)" />
      </div>

      <Card title={query ? `Résultats pour « ${query} »` : 'Membres du réseau'}>
        {members.length === 0 ? (
          <Empty
            label={
              query
                ? 'Aucun membre ne correspond à cette recherche.'
                : "Aucun filleul pour l'instant."
            }
          />
        ) : (
          <Table
            head={['Membre', 'Niveau', 'Statut', 'Étape', 'Investi', 'Dispo', 'Dern. activité']}
            cols="2fr 0.6fr 1.1fr 0.9fr 1fr 1fr 1fr"
            rows={members.map((m) => [
              <span
                key={m.id}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}
              >
                <Link
                  href={`/reseau/investisseur/${m.id}`}
                  style={{
                    color: 'var(--text-1)',
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.fullName ?? m.email}
                  {m.city ? <span style={{ color: 'var(--text-4)' }}> · {m.city}</span> : null}
                </Link>
                {m.phone ? (
                  <a
                    href={`tel:${m.phone}`}
                    title={`Appeler ${m.phone}`}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 6px', flexShrink: 0 }}
                  >
                    <Phone size={12} />
                  </a>
                ) : null}
              </span>,
              `N+${m.depth}`,
              statusLabel(m),
              stageLabel(m.pipelineStage),
              money(m.invested),
              m.walletBalanceCents != null && m.walletBalanceCents >= 10000 ? (
                <span key={`w-${m.id}`} style={{ color: 'var(--success)', fontWeight: 600 }}>
                  {money(m.walletBalanceCents / 100)}
                </span>
              ) : (
                '—'
              ),
              fmtDate(m.lastActivityAt),
            ])}
          />
        )}
      </Card>
    </>
  );
}
