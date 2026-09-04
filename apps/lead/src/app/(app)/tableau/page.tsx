import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { getAuthenticatedUser } from '@/lib/auth';
import { addDays, formatParis, weekMonday } from '@/lib/domain/time';
import { weeklySnapshot } from '@/lib/reporting/queries';

export const dynamic = 'force-dynamic';

function pct(n: number, d: number): string {
  return d ? `${Math.round((n / d) * 100)} %` : '—';
}

export default async function TableauPage({
  searchParams,
}: {
  searchParams: Promise<{ semaine?: string }>;
}) {
  const sp = await searchParams;
  const user = await getAuthenticatedUser();
  const offset = Number(sp.semaine ?? 0) || 0;
  const monday = addDays(weekMonday(new Date()), offset * 7);
  const rows = await weeklySnapshot(user, monday);
  const totals = rows.reduce(
    (a, r) => ({
      leads: a.leads + r.leads,
      rdv: a.rdv + r.rdvPoses,
      honores: a.honores + r.honores,
      conformes: a.conformes + r.conformes,
      signes: a.signes + r.signes,
    }),
    { leads: 0, rdv: 0, honores: 0, conformes: 0, signes: 0 },
  );
  return (
    <>
      <PageHeader
        title="Tableau du lundi"
        sub={`Semaine du ${formatParis.date(monday)} au ${formatParis.date(addDays(monday, 6))} · aperçu vivant, la version complète (dépense, coûts, alertes) arrive avec le module H.`}
        actions={
          <>
            <a className="btn btn-secondary btn-sm" href={`/tableau?semaine=${offset - 1}`}>
              ← Semaine précédente
            </a>
            {offset < 0 ? (
              <a className="btn btn-secondary btn-sm" href={`/tableau?semaine=${offset + 1}`}>
                Semaine suivante →
              </a>
            ) : null}
          </>
        }
      />
      {rows.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Campagne</th>
                <th>Leads</th>
                <th>RDV posés</th>
                <th>Taux de prise</th>
                <th>Honorés</th>
                <th>Présence</th>
                <th>Conformes</th>
                <th>Conformité</th>
                <th>Signés</th>
                <th>Délai moyen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.campaignId ?? 'none'}>
                  <td className="primary">{r.campaignName}</td>
                  <td className="num">{r.leads}</td>
                  <td className="num">{r.rdvPoses}</td>
                  <td className="num">{pct(r.rdvPoses, r.leads)}</td>
                  <td className="num">{r.honores}</td>
                  <td className="num">{pct(r.honores, r.rdvPoses)}</td>
                  <td className="num">{r.conformes}</td>
                  <td className="num">{pct(r.conformes, r.honores)}</td>
                  <td className="num">{r.signes}</td>
                  <td className="num">
                    {r.delaiMoyenMin === null ? '—' : `${r.delaiMoyenMin} min`}
                  </td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td>Total</td>
                <td className="num">{totals.leads}</td>
                <td className="num">{totals.rdv}</td>
                <td className="num">{pct(totals.rdv, totals.leads)}</td>
                <td className="num">{totals.honores}</td>
                <td className="num">{pct(totals.honores, totals.rdv)}</td>
                <td className="num">{totals.conformes}</td>
                <td className="num">{pct(totals.conformes, totals.honores)}</td>
                <td className="num">{totals.signes}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <EmptyState title="Aucun lead cette semaine" />
        </div>
      )}
    </>
  );
}
