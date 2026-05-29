'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { type ActionError, confirmMfaEnrollment } from '../../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary btn-lg"
      disabled={pending}
      style={{ width: '100%' }}
    >
      {pending ? 'Activation…' : 'Activer la double authentification'}
    </button>
  );
}

export function MfaSetupForm({
  factorId,
  qrCode,
  secret,
}: {
  factorId: string;
  qrCode: string;
  secret: string;
}) {
  const [state, formAction] = useActionState<ActionError | null, FormData>(
    confirmMfaEnrollment,
    null,
  );

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-1)' }}>
          Configure ta double authentification
        </h1>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
          Obligatoire pour ton rôle. Scanne ce QR code avec Google Authenticator, Authy ou
          1Password, puis entre le code à 6 chiffres généré.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: 14,
          background: '#fff',
          borderRadius: 10,
          border: '1px solid var(--border)',
        }}
      >
        {/* QR code SVG renvoyé par Supabase (data URI) */}
        {/* biome-ignore lint/performance/noImgElement: data-URI SVG, pas d'optimisation Next/Image possible */}
        <img src={qrCode} alt="QR code de configuration 2FA" width={180} height={180} />
      </div>

      <details style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
        <summary style={{ cursor: 'pointer' }}>Tu ne peux pas scanner ? Saisie manuelle</summary>
        <code
          style={{
            display: 'block',
            marginTop: 8,
            padding: '8px 10px',
            background: 'var(--surface-2)',
            borderRadius: 6,
            wordBreak: 'break-all',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-2)',
          }}
        >
          {secret}
        </code>
      </details>

      <input type="hidden" name="factorId" value={factorId} />

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
