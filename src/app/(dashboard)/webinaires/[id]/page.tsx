import { ArrowLeft, KanbanSquare } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth';
import { getWebinar } from '@/lib/db/queries/webinars';
import { groupByBucket } from '@/lib/webinars/call-order';
import { AttendeeRow } from './attendee-row';

export const dynamic = 'force-dynamic';

function fmtDate(d: Date | null): string {
  if (!d) return 'date inconnue';
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default async function WebinarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, user] = await Promise.all([getWebinar(id), getAuthenticatedUser()]);
  if (!data) notFound();

  const { webinar, attendees } = data;
  const webinarDurationS = webinar.durationMinutes ? webinar.durationMinutes * 60 : null;

  // L'ordre de rappel : la règle métier vit dans lib/webinars/call-order, testée.
  const groups = groupByBucket(
    attendees.map((a) => ({
      ...a,
      capacityRaw: a.extraFields?.["Capacité d'inscription"] ?? null,
      availabilityRaw: a.extraFields?.['Disponibilité des fonds sous 30 jours'] ?? null,
      webinarDurationS,
    })),
  );

  return (
    <>
      <div>
        <Link
          href="/webinaires"
          style={{
            fontSize: 12,
            color: 'var(--text-3)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 8,
          }}
        >
          <ArrowLeft size={13} />
          Tous les webinaires
        </Link>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 className="page-title">{webinar.title}</h1>
            <div className="page-desc">
              {fmtDate(webinar.scheduledAt)}
              {webinar.durationMinutes ? ` · ${webinar.durationMinutes} min` : ''} ·{' '}
              <strong>{webinar.registrations} inscrits</strong>
            </div>
          </div>
          {/* Le tableau de suivi de CE webinaire : la suite du travail commence là. */}
          <Link
            href={`/webinaires/suivi?webinar=${webinar.id}`}
            className="btn btn-secondary btn-sm"
          >
            <KanbanSquare size={13} />
            Tableau de suivi
          </Link>
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi label="En direct" value={String(webinar.live)} accent="var(--success)" />
        <Kpi label="Replay seul" value={String(webinar.replay)} accent="var(--brand)" />
        <Kpi label="Absents" value={String(webinar.noShow)} accent="var(--text-3)" />
        <Kpi label="Comptes SAH" value={String(webinar.linkedToSah)} accent="var(--ai)" />
        <Kpi
          label="Recrues"
          value={String(webinar.recruits)}
          accent="var(--ai)"
          hint="comptes Seven At Home ouverts grâce à ce webinaire"
        />
        <Kpi
          label="Collecte attribuée"
          value={`${Math.round(webinar.attributedRevenue).toLocaleString('fr-FR')} €`}
          accent="var(--success)"
          hint={
            webinar.attributedInvestors > 0
              ? `${webinar.attributedInvestors} investisseur${webinar.attributedInvestors > 1 ? 's' : ''}${
                  webinar.recruitRevenue > 0
                    ? ` · dont ${Math.round(webinar.recruitRevenue).toLocaleString('fr-FR')} € de recrues`
                    : ''
                }`
              : 'aucune souscription attribuable à ce webinaire'
          }
        />
      </div>

      {groups.map((group) => (
        <div className="view-card" key={group.bucket}>
          <div className="view-card-header">
            <div>
              <div className="view-card-title">{group.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 2 }}>
                {group.hint}
              </div>
            </div>
            <span className="badge badge-neutral">{group.rows.length}</span>
          </div>

          <div className="view-card-body" style={{ padding: 0 }}>
            {group.rows.length === 0 ? (
              <div style={{ padding: 20, fontSize: 13, color: 'var(--text-3)' }}>
                Personne dans ce groupe.
              </div>
            ) : (
              group.rows.map((row, idx) => (
                <AttendeeRow
                  key={row.registrationId}
                  attendee={row}
                  webinarId={webinar.id}
                  webinarDurationS={webinarDurationS}
                  rank={idx + 1}
                  myId={user.id}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </>
  );
}

function Kpi({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent: string;
  hint?: string;
}) {
  return (
    <div className="view-card">
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: accent }}>{label}</span>
        <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}>{value}</span>
        {hint ? <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{hint}</span> : null}
      </div>
    </div>
  );
}
