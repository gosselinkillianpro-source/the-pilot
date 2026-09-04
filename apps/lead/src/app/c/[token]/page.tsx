import { eq } from 'drizzle-orm';
import { SlotForm } from '@/components/public/slot-form';
import { resolveSignedLink } from '@/lib/crypto/signed-links';
import { leads, sources } from '@/lib/db/schema';
import { asSystem } from '@/lib/db/session';
import {
  addDays,
  DEFAULT_SERVICE_HOURS,
  isWithinServiceHours,
  zonedParts,
} from '@/lib/domain/time';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Choisir un moment de rappel' };

export default async function SlotPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await asSystem(async (tx) => {
    const link = await resolveSignedLink(tx, token, 'slot_pick');
    if (!link?.leadId || link.usedAt) return null;
    const rows = await tx
      .select({ firstName: leads.firstName, sourceName: sources.name, hours: sources.serviceHours })
      .from(leads)
      .innerJoin(sources, eq(sources.id, leads.sourceId))
      .where(eq(leads.id, link.leadId))
      .limit(1);
    return rows[0] ?? null;
  });

  if (!data) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Lien expiré</h1>
          <p className="hint">
            Ce lien n’est plus valable. Pas d’inquiétude : un conseiller vous rappellera.
          </p>
        </div>
      </div>
    );
  }

  // Trois prochains jours de service, en heure de Paris.
  const hours = Object.keys(data.hours).length ? data.hours : DEFAULT_SERVICE_HOURS;
  const days: { value: string; label: string }[] = [];
  for (let i = 0; i < 10 && days.length < 3; i++) {
    const probe = addDays(new Date(), i);
    const p = zonedParts(probe);
    const noon = new Date(Date.UTC(p.year, p.month - 1, p.day, 10, 0));
    if (!isWithinServiceHours(noon, hours)) continue;
    const value = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
    const label =
      i === 0
        ? 'Aujourd’hui'
        : i === 1
          ? 'Demain'
          : new Intl.DateTimeFormat('fr-FR', {
              timeZone: 'Europe/Paris',
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }).format(probe);
    days.push({ value, label });
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
            Quand pouvons-nous vous rappeler, {data.firstName} ?
          </h1>
          <p className="hint">
            Nous avons tenté de vous joindre sans succès. Choisissez le moment qui vous arrange.
          </p>
        </div>
        <SlotForm token={token} days={days} />
      </div>
    </div>
  );
}
