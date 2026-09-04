'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { type RescheduleState, requestRescheduleAction } from '@/app/r/[token]/actions';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="lg" block disabled={pending}>
      {pending ? '…' : 'Je ne pourrai pas venir : proposer un autre moment'}
    </Button>
  );
}

export function RescheduleForm({ token }: { token: string }) {
  const [state, action] = useActionState<RescheduleState, FormData>(
    requestRescheduleAction.bind(null, token),
    null,
  );
  if (state?.ok) return <p className="notice">{state.ok}</p>;
  return (
    <form action={action} className="stack" style={{ gap: 14 }}>
      <Field
        label="Quand seriez-vous disponible ?"
        hint="Un jour et un moment suffisent. Nous vous rappelons pour confirmer."
      >
        <Textarea
          name="message"
          required
          minLength={3}
          placeholder="Ex. : jeudi après 17 h, ou vendredi matin"
        />
      </Field>
      {state?.error ? <p className="error">{state.error}</p> : null}
      <Submit />
    </form>
  );
}
