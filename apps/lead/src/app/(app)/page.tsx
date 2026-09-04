import Link from 'next/link';
import { Chrono } from '@/components/ui/chrono';
import { EmptyState } from '@/components/ui/empty-state';
import { deltaPct, KpiCard } from '@/components/ui/kpi-card';
import { PageHeader } from '@/components/ui/page-header';
import { StatePill } from '@/components/ui/pill';
import { getAuthenticatedUser } from '@/lib/auth';
import { labelFor } from '@/lib/domain/answers/mep';
import { formatParis } from '@/lib/domain/time';
import { dashboardStats, listCallQueue, listLeads } from '@/lib/leads/queries';

export const dynamic = 'force-dynamic';

function series(rows: { day: Date; n: number }[], days = 14): number[] {
  const out: number[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const row = rows.find((r) => r.day.toISOString().slice(0, 10) === key);
    out.push(row?.n ?? 0);
  }
  return out;
}

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();
  const [stats, queue, recent] = await Promise.all([
    dashboardStats(user),
    listCallQueue(user),
    listLeads(user, { limit: 8 }),
  ]);
  const now = queue
    .filter((q) => q.state === 'a_rappeler' && (!q.nextAttemptAt || q.nextAttemptAt <= new Date()))
    .slice(0, 6);
  const firstName = user.name?.split(' ')[0] ?? user.email.split('@')[0];

  return (
    <>
      <PageHeader title={`Bonjour ${firstName}`} sub={formatParis.long(new Date())} />
      <div className="kpi-row">
        <KpiCard
          label="Leads aujourd’hui"
          value={stats.leadsToday}
          delta={deltaPct(stats.leadsToday, stats.leadsYesterday)}
          deltaLabel="vs hier"
          series={series(stats.leadsPerDay)}
        />
        <KpiCard
          label="Délai médian de rappel (aujourd’hui)"
          value={
            stats.medianCallbackMinToday === null
              ? '—'
              : `${Math.round(stats.medianCallbackMinToday)} min`
          }
          delta={null}
          deltaLabel={
            stats.medianCallbackMinToday === null
              ? 'aucun appel'
              : stats.medianCallbackMinToday <= 5
                ? 'objectif tenu'
                : 'objectif 5 min'
          }
        />
        <KpiCard
          label="RDV posés cette semaine"
          value={stats.rdvThisWeek}
          delta={deltaPct(stats.rdvThisWeek, stats.rdvLastWeek)}
          deltaLabel="vs semaine passée"
          series={series(stats.rdvPerDay)}
        />
        <KpiCard
          label="Validations à échéance < 4 h"
          value={stats.awaitingValidationSoon}
          delta={null}
          deltaLabel={stats.awaitingValidationSoon ? 'à relancer' : 'rien en attente'}
        />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <span>À rappeler maintenant</span>
            <Link href="/a-rappeler" className="hint">
              Tout voir ({stats.queueCount})
            </Link>
          </div>
          {now.length ? (
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="table">
                <tbody>
                  {now.map((q) => (
                    <tr key={q.id}>
                      <td className="primary">
                        <Link href={`/leads/${q.id}`} className="row-link">
                          {q.firstName}
                        </Link>
                      </td>
                      <td>{labelFor('montant', q.answers.montant)}</td>
                      <td className="muted">{labelFor('objectif', q.answers.objectif)}</td>
                      <td>
                        <Chrono
                          minutesAtRender={q.minutesWaiting}
                          frozen={false}
                          targetMin={q.slaTargetMin}
                          alertMin={q.slaAlertMin}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Personne n’attend">
              Tous les leads reçus ont été rappelés.
            </EmptyState>
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <span>Derniers leads</span>
            <Link href="/leads" className="hint">
              Tous les leads
            </Link>
          </div>
          {recent.items.length ? (
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="table">
                <tbody>
                  {recent.items.map((l) => (
                    <tr key={l.id}>
                      <td className="primary">
                        <Link href={`/leads/${l.id}`} className="row-link">
                          {l.firstName}
                        </Link>
                      </td>
                      <td className="muted">{l.campaignName ?? '—'}</td>
                      <td>
                        <StatePill state={l.state} />
                      </td>
                      <td className="muted num">{formatParis.dateTime(l.receivedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Aucun lead pour l’instant">
              Le premier arrivera par le webhook du site.
            </EmptyState>
          )}
        </div>
      </div>
    </>
  );
}
