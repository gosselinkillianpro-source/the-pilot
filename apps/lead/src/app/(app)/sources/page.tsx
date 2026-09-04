import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { getAuthenticatedUser } from '@/lib/auth';
import { listSourcesForUser } from '@/lib/leads/queries';

export const dynamic = 'force-dynamic';

export default async function SourcesPage() {
  const user = await getAuthenticatedUser();
  if (user.role !== 'admin') redirect('/');
  const sources = await listSourcesForUser(user);
  return (
    <>
      <PageHeader
        title="Sources"
        count={sources.length}
        sub="Les marques de Breach qui envoient des leads. Créées par script (seed-source.mjs), réglées ici."
      />
      {sources.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Code</th>
                <th>SLA</th>
                <th>Jours de service</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td className="primary">
                    <Link href={`/sources/${s.id}`} className="row-link">
                      {s.name}
                    </Link>
                  </td>
                  <td className="muted num">{s.code}</td>
                  <td className="num">
                    {s.slaTargetMin} / {s.slaAlertMin} min
                  </td>
                  <td className="muted num">{Object.keys(s.serviceHours).length} j</td>
                  <td>{s.active ? <Pill tone="success">Active</Pill> : <Pill>Inactive</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <EmptyState title="Aucune source">
            Lancez `scripts/seed-source.mjs mep` pour créer la source MonExpertPatrimoine.
          </EmptyState>
        </div>
      )}
    </>
  );
}
