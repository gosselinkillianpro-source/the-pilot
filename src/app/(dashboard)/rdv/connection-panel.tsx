import { CalendarCheck, PlugZap, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type { ConnectedCloser } from '@/lib/rdv/access';

/**
 * Bandeau de connexion Calendly.
 *
 * Chaque closer relie SON agenda : la page n'affiche jamais celui d'un autre
 * par défaut. L'admin dispose en plus d'un sélecteur pour consulter celui de
 * n'importe quel membre du staff.
 */

export function ConnectPrompt({
  targetName,
  isOtherUser,
  targetUserId,
  canDelegate = false,
}: {
  targetName: string;
  isOtherUser: boolean;
  /** Compte dont on affiche l'agenda — cible de la connexion déléguée. */
  targetUserId?: string;
  /** Admin : peut connecter l'agenda d'un closer à sa place. */
  canDelegate?: boolean;
}) {
  if (isOtherUser) {
    return (
      <div className="view-card" style={{ borderColor: 'var(--warning)' }}>
        <div
          className="view-card-body"
          style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}
        >
          <PlugZap size={18} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 13, flex: 1, minWidth: 220 }}>
            <strong>{targetName} n'a pas encore relié son Calendly.</strong>
            <div style={{ color: 'var(--text-3)', marginTop: 4 }}>
              {canDelegate
                ? `Le plus simple reste que ${targetName} le fasse depuis sa propre page RDV. Si tu détiens son accès Calendly, tu peux le connecter à sa place : tu t'authentifieras chez Calendly avec SON compte, et l'agenda sera rangé sur le sien — pas sur le tien.`
                : `Seul ${targetName} peut autoriser l'accès à son agenda, depuis sa propre page RDV.`}
            </div>
            {canDelegate && targetUserId && (
              <a
                href={`/api/calendly/connect?pour=${targetUserId}`}
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 10 }}
              >
                <PlugZap size={14} />
                Connecter le Calendly de {targetName}
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="view-card" style={{ borderColor: 'var(--brand)' }}>
      <div
        className="view-card-body"
        style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <CalendarCheck size={20} style={{ color: 'var(--brand)', flexShrink: 0 }} />
          <div style={{ fontSize: 14 }}>
            <strong>Relie ton agenda Calendly</strong>
            <div style={{ color: 'var(--text-3)', marginTop: 4, fontSize: 13 }}>
              Tes rendez-vous apparaîtront ici, avec le suivi de chaque contact. Toi seul verras ton
              agenda — l'administrateur peut le consulter pour le pilotage.
            </div>
          </div>
        </div>
        <a href="/api/calendly/connect" className="btn btn-primary btn-sm">
          <PlugZap size={14} />
          Connecter mon Calendly
        </a>
      </div>
    </div>
  );
}

export function BrokenConnection({ message }: { message: string }) {
  return (
    <div className="view-card" style={{ borderColor: 'var(--danger)' }}>
      <div
        className="view-card-body"
        style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <TriangleAlert size={18} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          <div style={{ fontSize: 13 }}>
            <strong>La connexion Calendly n'est plus valide.</strong>
            <div style={{ color: 'var(--text-3)', marginTop: 4 }}>
              L'accès a probablement été révoqué côté Calendly. Aucun rendez-vous n'est affiché —
              mieux vaut un message clair qu'un agenda vide qui ressemblerait à « aucun RDV ».
            </div>
            <div style={{ color: 'var(--text-4)', marginTop: 6, fontSize: 11 }}>{message}</div>
          </div>
        </div>
        <a href="/api/calendly/connect" className="btn btn-primary btn-sm">
          Reconnecter
        </a>
      </div>
    </div>
  );
}

/** Sélecteur admin : de quel agenda parle-t-on ? */
export function CloserSwitcher({
  closers,
  activeUserId,
}: {
  closers: ConnectedCloser[];
  activeUserId: string;
}) {
  if (closers.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-4)',
          marginRight: 4,
        }}
      >
        Agenda de
      </span>
      {closers.map((c) => {
        const isActive = c.userId === activeUserId;
        return (
          <Link
            key={c.userId}
            href={`/rdv?closer=${c.userId}`}
            className={isActive ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            aria-current={isActive ? 'page' : undefined}
            title={c.connected ? `Calendly : ${c.calendlyEmail}` : 'Calendly non relié'}
          >
            {c.name ?? c.email}
            {!c.connected && (
              <span style={{ opacity: 0.6, marginLeft: 4 }}>
                <span aria-hidden>○</span>
                <span className="sr-only"> — Calendly non relié</span>
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
