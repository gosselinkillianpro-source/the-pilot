import Link from 'next/link';
import { Chrono } from '@/components/ui/chrono';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Pill, StatePill } from '@/components/ui/pill';
import { getAuthenticatedUser } from '@/lib/auth';
import { labelFor } from '@/lib/domain/answers/mep';
import { formatPhoneForDisplay } from '@/lib/domain/phone';
import { formatParis } from '@/lib/domain/time';
import { listCallQueue, type QueueItem } from '@/lib/leads/queries';

export const dynamic = 'force-dynamic';

function QueueTable({ items, showWhen }: { items: QueueItem[]; showWhen?: 'next' | 'callback' }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Chrono</th>
            <th>Lead</th>
            <th>Montant</th>
            <th>Objectif</th>
            <th>Timing</th>
            <th>Campagne</th>
            <th>Tentatives</th>
            {showWhen ? <th>{showWhen === 'next' ? 'Relance' : 'Rappel convenu'}</th> : null}
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {items.map((q) => (
            <tr key={q.id}>
              <td>
                <Chrono
                  minutesAtRender={q.minutesWaiting}
                  frozen={q.firstCallAt !== null}
                  targetMin={q.slaTargetMin}
                  alertMin={q.slaAlertMin}
                />
              </td>
              <td className="primary">
                <Link href={`/leads/${q.id}`} className="row-link">
                  {q.firstName}
                  <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
                    {formatPhoneForDisplay(q.phoneE164)}
                  </span>
                </Link>
              </td>
              <td>{labelFor('montant', q.answers.montant)}</td>
              <td className="muted">{labelFor('objectif', q.answers.objectif)}</td>
              <td className="muted">{labelFor('urgence', q.answers.urgence)}</td>
              <td className="muted">{q.campaignName ?? '—'}</td>
              <td className="num">{q.attemptsCount}</td>
              {showWhen ? (
                <td className="num">
                  {showWhen === 'next' && q.nextAttemptAt
                    ? formatParis.dateTime(q.nextAttemptAt)
                    : null}
                  {showWhen === 'callback' && q.callbackAt
                    ? formatParis.dateTime(q.callbackAt)
                    : null}
                </td>
              ) : null}
              <td>
                <StatePill state={q.state} />
                {q.offHoursReceived ? (
                  <Pill tone="info" className="ml-2">
                    hors service
                  </Pill>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function QueuePage() {
  const user = await getAuthenticatedUser();
  const now = new Date();
  const queue = await listCallQueue(user, now);
  const immediate = queue.filter(
    (q) =>
      (q.state === 'a_rappeler' && (!q.nextAttemptAt || q.nextAttemptAt <= now)) ||
      q.state === 'en_appel',
  );
  const scheduled = queue.filter(
    (q) => q.state === 'a_rappeler' && q.nextAttemptAt && q.nextAttemptAt > now,
  );
  const agreed = queue.filter((q) => q.state === 'a_rappeler_plus_tard');
  const unreachable = queue.filter((q) => q.state === 'injoignable');

  return (
    <>
      <PageHeader
        title="À rappeler"
        count={immediate.length}
        sub="Triés par heure de réception. Objectif : premier appel sous 5 minutes de service."
      />
      {immediate.length ? (
        <QueueTable items={immediate} />
      ) : (
        <div className="card">
          <EmptyState title="Rien à rappeler maintenant">
            Les nouveaux leads apparaîtront ici dès leur réception.
          </EmptyState>
        </div>
      )}

      {scheduled.length ? (
        <section style={{ marginTop: 28 }}>
          <h2 className="page-title" style={{ fontSize: 17, marginBottom: 12 }}>
            Relances planifiées <span className="page-count">{scheduled.length}</span>
          </h2>
          <QueueTable items={scheduled} showWhen="next" />
        </section>
      ) : null}

      {agreed.length ? (
        <section style={{ marginTop: 28 }}>
          <h2 className="page-title" style={{ fontSize: 17, marginBottom: 12 }}>
            Rappels convenus <span className="page-count">{agreed.length}</span>
          </h2>
          <QueueTable items={agreed} showWhen="callback" />
        </section>
      ) : null}

      {unreachable.length ? (
        <section style={{ marginTop: 28 }}>
          <h2 className="page-title" style={{ fontSize: 17, marginBottom: 12 }}>
            Injoignables <span className="page-count">{unreachable.length}</span>
          </h2>
          <QueueTable items={unreachable} />
        </section>
      ) : null}
    </>
  );
}
