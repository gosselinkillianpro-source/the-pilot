'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { type MagicState, requestMagicLink } from '../actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" block disabled={pending}>
      {pending ? 'Envoi…' : 'Recevoir mon lien de connexion'}
    </Button>
  );
}

export function MagicForm() {
  const [state, action] = useActionState<MagicState, FormData>(requestMagicLink, null);
  if (state?.sent) {
    return (
      <div className="stack">
        <p className="notice">
          Si cette adresse est connue, un lien de connexion vient de lui être envoyé. Il est valable
          quelques minutes.
        </p>
        <Link href="/login" className="hint" style={{ textAlign: 'center' }}>
          Retour
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      <Field
        label="Votre email"
        htmlFor="email"
        hint="Celui sur lequel vous recevez les fiches de rendez-vous."
      >
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      {state?.error ? <p className="error">{state.error}</p> : null}
      <Submit />
      <p className="hint" style={{ textAlign: 'center' }}>
        <Link href="/login">Connexion interne (admin, setter)</Link>
      </p>
    </form>
  );
}
