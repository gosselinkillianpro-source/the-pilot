'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { type ActionError, verifyMfaChallenge } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary btn-lg"
      disabled={pending}
      style={{ width: '100%' }}
    >
      {pending ? 'Vérification…' : 'Valider'}
    </button>
  );
}

export function MfaVerifyForm() {
  const [state, formAction] = useActionState<ActionError | null, FormData>(
    verifyMfaChallenge,
    null,
  );

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-1)' }}>
          Vérification en deux étapes
        </h1>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-3)', margin: 0 }}>
          Saisis le code à 6 chiffres de ton application d’authentification.
        </p>
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="code">
          Code à 6 chiffres
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          className="input"
          placeholder="123456"
          style={{ letterSpacing: '0.4em', textAlign: 'center', fontSize: '1.1rem' }}
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
