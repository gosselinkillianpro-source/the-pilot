import { Users2 } from 'lucide-react';
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

export default async function MembresPage() {
  const scope = await resolveAffiliateScope();
  if (!scope) return <NotLinked title="Mon réseau" />;
  const members = await getAffiliateMembers(scope.sahId);

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

      <div className="kpi-grid">
        <Kpi label="Membres" value={String(members.length)} />
        <Kpi label="Investisseurs" value={String(invested)} accent="var(--success)" />
      </div>

      <Card title="Membres du réseau">
        {members.length === 0 ? (
          <Empty label="Aucun filleul pour l'instant." />
        ) : (
          <Table
            head={['Membre', 'Niveau', 'Statut', 'Étape', 'Investi', 'Dispo', 'Dern. activité']}
            cols="2fr 0.6fr 1.1fr 0.9fr 1fr 1fr 1fr"
            rows={members.map((m) => [
              <Link
                key={m.id}
                href={`/reseau/investisseur/${m.id}`}
                style={{ color: 'var(--text-1)', fontWeight: 600 }}
              >
                {m.fullName ?? m.email}
                {m.city ? <span style={{ color: 'var(--text-4)' }}> · {m.city}</span> : null}
              </Link>,
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
