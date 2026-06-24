import { Receipt, Search } from 'lucide-react';
import Link from 'next/link';
import { Card, Empty, Kpi, money, NotLinked, Table } from '@/components/affiliate/ui';
import { getAffiliateSubscriptions, resolveAffiliateScope } from '@/lib/db/queries/affiliate';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  signed: 'Signée',
  paid: 'Payée',
  active: 'Active',
  repaid: 'Remboursée',
  cancelled: 'Annulée',
};

function fmtDate(s: string | null): string {
  return s ? s.slice(0, 10) : '—';
}

export default async function SouscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const scope = await resolveAffiliateScope();
  if (!scope) return <NotLinked title="Souscriptions" />;
  const { q } = await searchParams;
  const query = q?.trim() ?? '';
  const subs = await getAffiliateSubscriptions(scope.sahId, query);

  const collected = subs
    .filter((s) => s.status !== 'cancelled')
    .reduce((acc, s) => acc + s.amount, 0);

  return (
    <>
      <div>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Receipt size={20} style={{ color: 'var(--ai)' }} />
          Souscriptions
        </h1>
        <div className="page-desc">Toutes les souscriptions de ton réseau.</div>
      </div>

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
            placeholder="Rechercher (investisseur ou projet)…"
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
          <Link href="/reseau/souscriptions" className="btn btn-secondary btn-sm">
            Effacer
          </Link>
        ) : null}
      </form>

      <div className="kpi-grid">
        <Kpi label="Souscriptions" value={String(subs.length)} />
        <Kpi label="Collecte (hors annulées)" value={money(collected)} accent="var(--success)" />
      </div>

      <Card title="Détail des souscriptions">
        {subs.length === 0 ? (
          <Empty label="Aucune souscription dans le réseau." />
        ) : (
          <Table
            head={['Investisseur', 'Projet', 'Montant', 'Statut', 'Date']}
            cols="1.5fr 1.5fr 1fr 1fr 1fr"
            rows={subs.map((s) => [
              <Link
                key={s.id}
                href={`/reseau/investisseur/${s.investorId}`}
                style={{ color: 'var(--text-1)', fontWeight: 600 }}
              >
                {s.investorName ?? '—'}
              </Link>,
              s.projectName ?? '—',
              money(s.amount),
              STATUS_LABELS[s.status] ?? s.status,
              fmtDate(s.date),
            ])}
          />
        )}
      </Card>
    </>
  );
}
