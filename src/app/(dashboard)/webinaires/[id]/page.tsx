import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
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
  const data = await getWebinar(id);
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
        <h1 className="page-title">{webinar.title}</h1>
        <div className="page-desc">
          {fmtDate(webinar.scheduledAt)}
          {webinar.durationMinutes ? ` · ${webinar.durationMinutes} min` : ''} ·{' '}
          <strong>{webinar.registrations} inscrits</strong>
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi label="En direct" value={webinar.live} accent="var(--success)" />
        <Kpi label="Replay seul" value={webinar.replay} accent="var(--brand)" />
        <Kpi label="Absents" value={webinar.noShow} accent="var(--text-3)" />
        <Kpi label="Comptes SAH" value={webinar.linkedToSah} accent="var(--ai)" />
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
                />
              ))
            )}
          </div>
        </div>
      ))}
    </>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="view-card">
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: accent }}>{label}</span>
        <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}>{value}</span>
      </div>
    </div>
  );
}
