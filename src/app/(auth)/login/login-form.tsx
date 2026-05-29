'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { type ActionError, signIn } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary btn-lg"
      disabled={pending}
      style={{ width: '100%' }}
    >
      {pending ? 'Connexion…' : 'Se connecter'}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<ActionError | null, FormData>(signIn, null);

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-1)' }}>
          Connexion
        </h1>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-3)', margin: 0 }}>
          Accède à ton tableau de bord Seven At Home.
        </p>
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          placeholder="prenom@sevenathome.fr"
        />
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="password">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
          placeholder="••••••••"
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
