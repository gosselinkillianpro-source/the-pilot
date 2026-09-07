import Link from 'next/link';
import { findInvitationByTokenHash } from '@/lib/db/queries/invitations';
import {
  hashInvitationToken,
  INVITATION_STATUS_MESSAGE,
  invitationStatus,
  looksLikeInvitationToken,
} from '@/lib/invitations/token';
import { SetPasswordForm } from './set-password-form';

export const metadata = { title: 'Invitation — THE PILOT' };
export const dynamic = 'force-dynamic';

/**
 * La page du lien reçu par e-mail : on vérifie le jeton, on affiche à qui
 * s'adresse l'invitation, et la personne choisit son mot de passe.
 */
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!looksLikeInvitationToken(token)) {
    return <Unusable message="Ce lien d’invitation n’est pas valide." />;
  }
  const inv = await findInvitationByTokenHash(hashInvitationToken(token));
  if (!inv)
    return <Unusable message="Invitation introuvable. Demande un nouveau lien à Killian." />;

  const status = invitationStatus(inv, new Date());
  if (status !== 'pending') {
    return (
      <Unusable message={INVITATION_STATUS_MESSAGE[status]} showLogin={status === 'accepted'} />
    );
  }

  return (
    <SetPasswordForm
      token={token}
      email={inv.email}
      fullName={inv.fullName}
      role={inv.role}
      inviterName={inv.inviterName ?? 'Killian'}
    />
  );
}

function Unusable({ message, showLogin = false }: { message: string; showLogin?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-1)' }}>
        Invitation
      </h1>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
        {message}
      </p>
      {showLogin ? (
        <Link href="/login" className="btn btn-primary btn-lg" style={{ width: '100%' }}>
          Se connecter
        </Link>
      ) : null}
    </div>
  );
}
