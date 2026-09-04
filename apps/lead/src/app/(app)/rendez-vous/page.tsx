import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { type AppointmentListItem, listAppointments } from '@/lib/appointments/queries';
import { getAuthenticatedUser } from '@/lib/auth';
import { labelFor } from '@/lib/domain/answers/mep';
import { formatParis } from '@/lib/domain/time';

export const dynamic = 'force-dynamic';

const STATUS: Record<
  AppointmentListItem['status'],
  { label: string; tone: 'info' | 'success' | 'danger' | 'neutral' }
> = {
  pose: { label: 'Posé', tone: 'info' },
  honore: { label: 'Honoré', tone: 'success' },
  absent: { label: 'Absent', tone: 'danger' },
  reprogramme: { label: 'Reprogrammé', tone: 'neutral' },
  annule: { label: 'Annulé', tone: 'neutral' },
};

function Table({ items }: { items: AppointmentListItem[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Lead</th>
            <th>Acheteur</th>
            <th>Montant</th>
            <th>Objectif</th>
            <th>Statut</th>
            <th>Conformité</th>
            <th>Validation due</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td className="num">{formatParis.long(a.scheduledAt)}</td>
              <td className="primary">
                <Link href={`/leads/${a.leadId}`} className="row-link">
                  {a.firstName}
                </Link>
              </td>
              <td>{a.buyerName}</td>
              <td>{labelFor('montant', a.answers.montant)}</td>
              <td className="muted">{labelFor('objectif', a.answers.objectif)}</td>
              <td>
                <Pill tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Pill>
              </td>
              <td>
                {a.conformity ? (
                  <Pill tone={a.conformity === 'conforme' ? 'success' : 'danger'}>
                    {a.conformity === 'conforme' ? 'Conforme' : 'Non conforme'}
                  </Pill>
                ) : (
                  <span className="hint">—</span>
                )}
              </td>
              <td className="muted num">
                {a.validatedAt
                  ? `validé ${formatParis.dateTime(a.validatedAt)}`
                  : formatParis.dateTime(a.validationDueAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AppointmentsPage() {
  const user = await getAuthenticatedUser();
  const { toValidate, upcoming, past } = await listAppointments(user);
  return (
    <>
      <PageHeader
        title="Rendez-vous"
        count={upcoming.length + past.length + toValidate.length}
        sub="Posés par les setters, validés par les acheteurs sous 48 h."
      />
      {toValidate.length ? (
        <section style={{ marginBottom: 28 }}>
          <h2 className="page-title" style={{ fontSize: 17, marginBottom: 12 }}>
            En attente de validation <span className="page-count">{toValidate.length}</span>
          </h2>
          <Table items={toValidate} />
        </section>
      ) : null}
      <section style={{ marginBottom: 28 }}>
        <h2 className="page-title" style={{ fontSize: 17, marginBottom: 12 }}>
          À venir <span className="page-count">{upcoming.length}</span>
        </h2>
        {upcoming.length ? (
          <Table items={upcoming} />
        ) : (
          <div className="card">
            <EmptyState title="Aucun rendez-vous à venir" />
          </div>
        )}
      </section>
      {past.length ? (
        <section>
          <h2 className="page-title" style={{ fontSize: 17, marginBottom: 12 }}>
            Passés <span className="page-count">{past.length}</span>
          </h2>
          <Table items={past} />
        </section>
      ) : null}
    </>
  );
}
