'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { MIN_PASSWORD_LENGTH, roleLabel } from '@/lib/invitations/token';
import { type AcceptError, acceptInvitationAction } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary btn-lg"
      disabled={pending}
      style={{ width: '100%' }}
    >
      {pending ? 'Création du compte…' : 'Créer mon compte'}
    </button>
  );
}

export function SetPasswordForm({
  token,
  email,
  fullName,
  role,
  inviterName,
}: {
  token: string;
  email: string;
  fullName: string | null;
  role: string;
  inviterName: string;
}) {
  const [state, formAction] = useActionState<AcceptError | null, FormData>(
    acceptInvitationAction,
    null,
  );

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-1)' }}>
          Bienvenue{fullName ? `, ${fullName.split(' ')[0]}` : ''}
        </h1>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
          {inviterName} t’invite sur THE PILOT en tant que <strong>{roleLabel(role)}</strong>.
          Choisis ton mot de passe : ton compte est créé tout de suite, puis tu actives la double
          authentification.
        </p>
      </div>

      <input type="hidden" name="token" value={token} />

      <div className="form-field">
        <label className="form-label" htmlFor="email">
          Ton identifiant
        </label>
        <input id="email" type="email" className="input" value={email} readOnly disabled />
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="fullName">
          Prénom Nom
        </label>
        <input
          id="fullName"
          name="fullName"
          className="input"
          defaultValue={fullName ?? ''}
          autoComplete="name"
          required
          minLength={2}
        />
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="password">
          Mot de passe ({MIN_PASSWORD_LENGTH} caractères minimum)
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          placeholder="••••••••••"
        />
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="confirm">
          Confirme le mot de passe
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          placeholder="••••••••••"
        />
      </div>

      {state?.error ? (
        <p
          role="alert"
          style={{
            fontSize: '0.75rem',
            color: 'var(--danger)',
            margin: 0,
            padding: '8px 10px',
            borderRadius: 8,
            background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--danger) 24%, transparent)',
          }}
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
