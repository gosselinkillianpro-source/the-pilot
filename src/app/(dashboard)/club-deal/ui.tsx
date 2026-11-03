import { CheckCircle2, PhoneCall, PhoneOff } from 'lucide-react';
import { isKeyOf, PROCESSING, type ProcessingStatus } from '@/lib/club-deal/constants';
import { PLATFORM_LABELS, type PlatformStatus } from '@/lib/db/queries/club-deal-platform';
import { STATUS_TONE } from './tones';

/** Petits éléments d'affichage partagés par la liste et la fiche (composants serveur). */

export function money(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`;
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString('fr-FR')} k€`;
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

export function fmtDate(d: Date | string, withTime = false): string {
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : { year: 'numeric' }),
    timeZone: 'Europe/Paris',
  });
}

export function statusOf(code: string): ProcessingStatus {
  return isKeyOf(PROCESSING, code) ? code : 'nouveau';
}

export function StatusBadge({ code }: { code: string }) {
  const s = statusOf(code);
  return <span className={`badge ${STATUS_TONE[s].badge}`}>{PROCESSING[s]}</span>;
}

const PLATFORM_BADGE: Record<PlatformStatus['level'], string> = {
  absent: 'badge-neutral',
  inscrit: 'badge-warning',
  kyc: 'badge-brand',
  investi: 'badge-success',
};

export function PlatformBadge({ status }: { status: PlatformStatus }) {
  return (
    <span
      className={`badge ${PLATFORM_BADGE[status.level]}`}
      title={
        status.level === 'investi'
          ? `${money(status.totalInvested)} investis sur ${status.projectsCount} projet(s)`
          : undefined
      }
    >
      {status.level === 'investi' && <CheckCircle2 size={11} />}
      {PLATFORM_LABELS[status.level]}
    </span>
  );
}

/** Téléphone + accord d'appel : on n'appelle QUE si la personne l'a accepté. */
export function PhoneWithConsent({ phone, consent }: { phone: string | null; consent: boolean }) {
  if (!phone) return <span style={{ color: 'var(--text-4)' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      {consent ? (
        <a href={`tel:${phone}`} style={{ color: 'var(--text-1)' }}>
          {phone}
        </a>
      ) : (
        <span style={{ color: 'var(--text-3)' }}>{phone}</span>
      )}
      <span
        className={`badge ${consent ? 'badge-success' : 'badge-danger'}`}
        style={{ height: 18, padding: '0 6px', fontSize: 10 }}
        title={
          consent ? 'A donné son accord pour un appel' : "N'a PAS donné son accord pour un appel"
        }
      >
        {consent ? <PhoneCall size={10} /> : <PhoneOff size={10} />}
        {consent ? 'appel OK' : 'pas d’appel'}
      </span>
    </span>
  );
}
