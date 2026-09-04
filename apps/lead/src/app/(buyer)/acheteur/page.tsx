import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { type AppointmentListItem, listAppointments } from '@/lib/appointments/queries';
import { getAuthenticatedUser } from '@/lib/auth';
import { labelFor } from '@/lib/domain/answers/mep';
import { formatParis } from '@/lib/domain/time';

export const dynamic = 'force-dynamic';

function Rows({ items }: { items: AppointmentListItem[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Prénom</th>
            <th>Montant</th>
            <th>Objectif</th>
            <th>Timing</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td className="num">{formatParis.long(a.scheduledAt)}</td>
              <td className="primary">{a.firstName}</td>
              <td>{labelFor('montant', a.answers.montant)}</td>
              <td className="muted">{labelFor('objectif', a.answers.objectif)}</td>
              <td className="muted">{labelFor('urgence', a.answers.urgence)}</td>
              <td>
                <Pill
                  tone={
                    a.status === 'pose' ? 'info' : a.status === 'honore' ? 'success' : 'neutral'
                  }
                >
                  {a.status}
                </Pill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function BuyerHome() {
  const user = await getAuthenticatedUser();
  const { toValidate, upcoming, past } = await listAppointments(user);
  return (
    <>
      <PageHeader
        title="Vos rendez-vous"
        sub="La validation en trois questions (a eu lieu ? conforme ? suite ?) arrive par email après chaque rendez-vous, et bientôt ici."
      />
      {toValidate.length ? (
        <section style={{ marginBottom: 24 }}>
          <h2 className="page-title" style={{ fontSize: 17, marginBottom: 10 }}>
            À valider <span className="page-count">{toValidate.length}</span>
          </h2>
          <Rows items={toValidate} />
        </section>
      ) : null}
      <section style={{ marginBottom: 24 }}>
        <h2 className="page-title" style={{ fontSize: 17, marginBottom: 10 }}>
          À venir <span className="page-count">{upcoming.length}</span>
        </h2>
        {upcoming.length ? (
          <Rows items={upcoming} />
        ) : (
          <div className="card">
            <EmptyState title="Aucun rendez-vous à venir" />
          </div>
        )}
      </section>
      {past.length ? (
        <section>
          <h2 className="page-title" style={{ fontSize: 17, marginBottom: 10 }}>
            Passés <span className="page-count">{past.length}</span>
          </h2>
          <Rows items={past} />
        </section>
      ) : null}
    </>
  );
}
