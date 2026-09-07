'use client';

import { Check, Copy, Link2, MailPlus, RefreshCw, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import type { InvitationRecord } from '@/lib/db/queries/invitations';
import { type InvitationStatus, invitationStatus, roleLabel } from '@/lib/invitations/token';
import {
  type InviteInput,
  type InviteResult,
  inviteUserAction,
  resendInvitationAction,
  revokeInvitationAction,
} from './actions';

/**
 * « Inviter un membre » + la liste des invitations, sur la page Équipe.
 *
 * Le lien n'apparaît qu'au moment où il est fabriqué (création, renvoi) : on
 * le montre alors en clair avec un bouton Copier, parce que l'e-mail peut ne
 * pas partir (mode test, Brevo) et que le lien passé en main propre marche
 * tout aussi bien.
 */

const ROLE_OPTIONS: { value: InviteInput['role']; label: string; hint: string }[] = [
  { value: 'closer', label: 'Closer', hint: 'Son poste : Aujourd’hui, Mes clients, Mes résultats' },
  { value: 'closer_junior', label: 'Closer junior', hint: 'Mêmes écrans, même règles' },
  { value: 'executive', label: 'Direction (lecture)', hint: 'Voit tout, ne modifie rien' },
  { value: 'admin', label: 'Admin', hint: 'Tout, y compris les accès' },
];

type LastLink = {
  url: string;
  email: string;
  sentTo: string | null;
  testMode: boolean;
  sendError: string | null;
};

export function InvitePanel({ invitations }: { invitations: InvitationRecord[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<InviteInput['role']>('closer');
  const [sahUserId, setSahUserId] = useState('');
  const [last, setLast] = useState<LastLink | null>(null);

  function handleResult(res: InviteResult, forEmail: string) {
    if (!res.ok) {
      toast(res.message, { variant: 'error' });
      return;
    }
    setLast({
      url: res.url,
      email: forEmail,
      sentTo: res.sentTo,
      testMode: res.testMode,
      sendError: res.sendError,
    });
    if (res.sendError) {
      toast(`Invitation créée, mais l'e-mail n'est pas parti : ${res.sendError}`, {
        variant: 'error',
        duration: 8000,
      });
    } else {
      toast(
        res.testMode
          ? `Invitation créée. E-mail envoyé à l'adresse de test (${res.sentTo}) — mode test actif.`
          : `Invitation envoyée à ${res.sentTo}.`,
        { variant: 'success', duration: 6000 },
      );
    }
    router.refresh();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    startTransition(async () => {
      const res = await inviteUserAction({ email: target, fullName, role, sahUserId });
      if (res.ok) {
        setEmail('');
        setFullName('');
        setSahUserId('');
      }
      handleResult(res, target);
    });
  }

  function resend(inv: InvitationRecord) {
    startTransition(async () => {
      const res = await resendInvitationAction({ id: inv.id });
      handleResult(res, inv.email);
    });
  }

  function revoke(inv: InvitationRecord) {
    startTransition(async () => {
      const res = await revokeInvitationAction({ id: inv.id });
      if (!res.ok) {
        toast(res.message, { variant: 'error' });
        return;
      }
      toast(`Invitation de ${inv.email} annulée.`, { variant: 'success' });
      if (last?.email === inv.email) setLast(null);
      router.refresh();
    });
  }

  const now = new Date();

  return (
    <div className="view-card">
      <div className="view-card-header">
        <div>
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <MailPlus size={15} />
            Accès — inviter un membre
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 2 }}>
            La personne reçoit un lien, choisit son mot de passe (même e-mail), puis active sa
            double authentification. Le lien vaut 7 jours.
          </div>
        </div>
        <span className="badge badge-neutral">{invitations.length}</span>
      </div>
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <form
          onSubmit={submit}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <div className="form-field">
            <label className="form-label" htmlFor="invite-name">
              Prénom Nom
            </label>
            <input
              id="invite-name"
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Dimitri Starodouboff"
              required
              minLength={2}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="invite-email">
              E-mail
            </label>
            <input
              id="invite-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom.nom@sevenathome.com"
              required
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="invite-role">
              Rôle
            </label>
            <select
              id="invite-role"
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as InviteInput['role'])}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value} title={r.hint}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="invite-sah">
              N° SAH (CGP) — facultatif
            </label>
            <input
              id="invite-sah"
              className="input"
              value={sahUserId}
              onChange={(e) => setSahUserId(e.target.value)}
              placeholder="ex. 1315"
              inputMode="numeric"
              title="Identifiant SAH de la personne : ses inscrits (code bonus) lui seront attribués dès l'acceptation."
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            <MailPlus size={14} />
            {pending ? '…' : 'Inviter'}
          </button>
        </form>

        {last ? <LinkBox last={last} /> : null}

        {invitations.length > 0 ? (
          <div className="table-scroll" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <Th>Personne</Th>
                  <Th>Rôle</Th>
                  <Th>N° SAH</Th>
                  <Th>État</Th>
                  <Th>Envois</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => {
                  const status = invitationStatus(inv, now);
                  return (
                    <tr key={inv.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <Td>
                        <span style={{ fontWeight: 600, color: 'var(--text-1)', display: 'block' }}>
                          {inv.fullName ?? inv.email}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{inv.email}</span>
                      </Td>
                      <Td>{roleLabel(inv.role)}</Td>
                      <Td>{inv.sahUserId ?? '—'}</Td>
                      <Td>
                        <StatusBadge status={status} inv={inv} />
                      </Td>
                      <Td>
                        {inv.sendCount}
                        {inv.lastSentAt ? (
                          <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>
                            dernier {fmtDate(inv.lastSentAt)}
                          </span>
                        ) : null}
                      </Td>
                      <Td align="right">
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {status === 'pending' || status === 'expired' || status === 'revoked' ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={pending}
                              onClick={() => resend(inv)}
                              title="Fabrique un nouveau lien (l'ancien ne marche plus) et renvoie l'e-mail"
                            >
                              <RefreshCw size={12} />
                              Renvoyer
                            </button>
                          ) : null}
                          {status === 'pending' ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={pending}
                              onClick={() => revoke(inv)}
                              style={{ color: 'var(--danger)' }}
                            >
                              <XCircle size={12} />
                              Annuler
                            </button>
                          ) : null}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            Aucune invitation pour l'instant.
          </div>
        )}
      </div>
    </div>
  );
}

function LinkBox({ last }: { last: LastLink }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(last.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div
      style={{
        border: '1px solid var(--brand)',
        background: 'var(--brand-bg)',
        borderRadius: 10,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-2)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Link2 size={13} />
        Lien d'invitation pour <strong>{last.email}</strong>
        {last.sendError
          ? ' — e-mail non parti, passe-lui ce lien directement'
          : last.testMode
            ? ` — e-mail parti à l'adresse de test ${last.sentTo ?? ''} (mode test), passe-lui ce lien directement`
            : ' — aussi envoyé par e-mail'}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <code
          style={{
            fontSize: 11.5,
            padding: '6px 8px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            wordBreak: 'break-all',
            flex: 1,
            minWidth: 200,
          }}
        >
          {last.url}
        </code>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
        Ce lien n'est affiché qu'une fois : il n'est pas conservé en clair. « Renvoyer » en fabrique
        un nouveau.
      </span>
    </div>
  );
}

function StatusBadge({ status, inv }: { status: InvitationStatus; inv: InvitationRecord }) {
  switch (status) {
    case 'accepted':
      return (
        <span className="badge badge-success" title={inv.acceptedAt ? fmtDate(inv.acceptedAt) : ''}>
          compte créé
        </span>
      );
    case 'revoked':
      return <span className="badge badge-neutral">annulée</span>;
    case 'expired':
      return <span className="badge badge-warning">expirée</span>;
    default:
      return (
        <span className="badge badge-brand" title={`Valable jusqu'au ${fmtDate(inv.expiresAt)}`}>
          en attente
        </span>
      );
  }
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: '8px 12px',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-3)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td style={{ textAlign: align, padding: '8px 12px', verticalAlign: 'top' }}>{children}</td>
  );
}
