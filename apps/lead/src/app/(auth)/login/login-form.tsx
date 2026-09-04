'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { type ActionError, signIn } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" block disabled={pending}>
      {pending ? 'Connexion…' : 'Se connecter'}
    </Button>
  );
}

export function LoginForm() {
  const [state, action] = useActionState<ActionError, FormData>(signIn, null);
  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Mot de passe" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      {state?.error ? <p className="error">{state.error}</p> : null}
      <Submit />
      <p className="hint" style={{ textAlign: 'center' }}>
        Vous êtes un acheteur de rendez-vous ?{' '}
        <Link href="/login/acheteur" style={{ color: 'var(--brand-text)', fontWeight: 600 }}>
          Recevoir un lien de connexion
        </Link>
      </p>
    </form>
  );
}
