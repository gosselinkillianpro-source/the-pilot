import { Receipt } from 'lucide-react';
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

export default async function SouscriptionsPage() {
  const scope = await resolveAffiliateScope();
  if (!scope) return <NotLinked title="Souscriptions" />;
  const subs = await getAffiliateSubscriptions(scope.sahId);

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
