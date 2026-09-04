import { eq } from 'drizzle-orm';
import { RescheduleForm } from '@/components/public/reschedule-form';
import { resolveSignedLink } from '@/lib/crypto/signed-links';
import { appointments, buyers, leads, sources } from '@/lib/db/schema';
import { asSystem } from '@/lib/db/session';
import { formatParis } from '@/lib/domain/time';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Replanifier mon rendez-vous' };

export default async function ReschedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await asSystem(async (tx) => {
    const link = await resolveSignedLink(tx, token, 'reschedule');
    if (!link?.appointmentId) return null;
    const rows = await tx
      .select({
        scheduledAt: appointments.scheduledAt,
        status: appointments.status,
        firstName: leads.firstName,
        buyerName: buyers.name,
        bookingUrl: buyers.calendarConfig,
        sourceName: sources.name,
      })
      .from(appointments)
      .innerJoin(leads, eq(leads.id, appointments.leadId))
      .innerJoin(buyers, eq(buyers.id, appointments.buyerId))
      .innerJoin(sources, eq(sources.id, leads.sourceId))
      .where(eq(appointments.id, link.appointmentId))
      .limit(1);
    return rows[0] ?? null;
  });

  if (!data) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Lien expiré</h1>
          <p className="hint">
            Répondez simplement à votre SMS de confirmation, nous nous en occupons.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div>
          <div
            className="sidebar-brand-sub"
            style={{
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
              color: 'var(--brand-text)',
            }}
          >
            {data.sourceName}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
            Votre rendez-vous, {data.firstName}
          </h1>
          <p style={{ marginTop: 6 }}>
            <strong>{formatParis.long(data.scheduledAt)}</strong> avec {data.buyerName}, expert
            certifié ORIAS.
          </p>
        </div>
        {data.bookingUrl?.booking_url ? (
          <a
            href={data.bookingUrl.booking_url}
            className="btn btn-primary btn-lg"
            target="_blank"
            rel="noreferrer"
          >
            Choisir un autre créneau dans l’agenda
          </a>
        ) : null}
        <RescheduleForm token={token} />
      </div>
    </div>
  );
}
