import { CalendarClock, Euro, Radio, Users } from 'lucide-react';
import Link from 'next/link';
import { listWebinars } from '@/lib/db/queries/webinars';

export const dynamic = 'force-dynamic';

function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

function fmtDate(d: Date | null): string {
  if (!d) return 'date inconnue';
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function fmtAgo(d: Date | null): string {
  if (!d) return 'jamais synchronisé';
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "synchronisé à l'instant";
  if (min < 60) return `synchronisé il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `synchronisé il y a ${h} h`;
  return `synchronisé il y a ${Math.floor(h / 24)} j`;
}

export default async function WebinairesPage() {
  const webinars = await listWebinars();

  return (
    <>
      <div>
        <h1 className="page-title">Webinaires</h1>
        <div className="page-desc">
          Qui s'est inscrit, qui est venu, combien de temps — et dans quel ordre les rappeler.
        </div>
      </div>

      {webinars.length === 0 ? (
        <div className="view-card">
          <div className="view-card-body" style={{ fontSize: 13, color: 'var(--text-3)' }}>
            Aucun webinaire synchronisé pour l'instant. La synchronisation WebinarGeek tourne
            automatiquement ; elle remplace l'export CSV manuel.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {webinars.map((w) => {
            const attended = w.live + w.replay;
            const rate = w.registrations > 0 ? Math.round((attended / w.registrations) * 100) : 0;
            return (
              <Link
                key={w.id}
                href={`/webinaires/${w.id}`}
                className="view-card"
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <div className="view-card-body">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 16,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>
                        {w.title}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-3)',
                          marginTop: 4,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          flexWrap: 'wrap',
                        }}
                      >
                        <CalendarClock size={13} />
                        {fmtDate(w.scheduledAt)}
                        {w.durationMinutes ? ` · ${w.durationMinutes} min` : ''}
                        <span style={{ color: 'var(--text-4)' }}>· {fmtAgo(w.syncedAt)}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                      <Stat label="Inscrits" value={w.registrations} icon={<Users size={13} />} />
                      <Stat label="En direct" value={w.live} tone="var(--success)" />
                      <Stat label="Replay" value={w.replay} tone="var(--brand)" />
                      <Stat label="Absents" value={w.noShow} tone="var(--text-3)" />
                      <Stat
                        label="Présence"
                        value={`${rate} %`}
                        tone={rate >= 30 ? 'var(--success)' : 'var(--warning)'}
                      />
                      <Stat
                        label="Recrues"
                        value={w.recruits}
                        tone={w.recruits > 0 ? 'var(--ai)' : 'var(--text-3)'}
                      />
                      <Stat
                        label="Collecte"
                        value={money(w.attributedRevenue)}
                        tone={w.attributedRevenue > 0 ? 'var(--success)' : 'var(--text-3)'}
                        icon={<Euro size={13} />}
                      />
                    </div>
                  </div>

                  {w.attributedRevenue > 0 && (
                    <div
                      style={{
                        marginTop: 12,
                        paddingTop: 10,
                        borderTop: '1px solid var(--border)',
                        fontSize: 12,
                        color: 'var(--text-3)',
                      }}
                    >
                      <strong style={{ color: 'var(--success)' }}>
                        {money(w.attributedRevenue)}
                      </strong>{' '}
                      souscrits par <strong>{w.attributedInvestors}</strong> inscrit
                      {w.attributedInvestors > 1 ? 's' : ''}
                      {w.recruitRevenue > 0 && (
                        <>
                          {' '}
                          · dont{' '}
                          <strong style={{ color: 'var(--ai)' }}>{money(w.recruitRevenue)}</strong>{' '}
                          de comptes ouverts grâce à ce webinaire
                        </>
                      )}{' '}
                      <span style={{ color: 'var(--text-4)' }}>
                        — pour un membre déjà présent avant le live, seule sa première souscription
                        est comptée
                      </span>
                    </div>
                  )}

                  {w.linkedToSah > 0 && (
                    <div
                      style={{
                        marginTop: 12,
                        paddingTop: 10,
                        borderTop: '1px solid var(--border)',
                        fontSize: 12,
                        color: 'var(--text-3)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Radio size={13} style={{ color: 'var(--success)' }} />
                      <strong style={{ color: 'var(--text-2)' }}>{w.linkedToSah}</strong> inscrits
                      ont déjà un compte Seven At Home
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number | string;
  tone?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: 'right', minWidth: 62 }}>
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-4)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          justifyContent: 'flex-end',
        }}
      >
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, color: tone ?? 'var(--text-1)' }}>{value}</div>
    </div>
  );
}
