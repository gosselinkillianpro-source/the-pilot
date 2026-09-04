'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { chooseSlotAction, type SlotState } from '@/app/c/[token]/actions';
import { Button } from '@/components/ui/button';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" block disabled={pending}>
      {pending ? '…' : 'Confirmer ce moment'}
    </Button>
  );
}

const SLOTS = [
  ['matin', 'Matin (9 h – 12 h)'],
  ['apres-midi', 'Après-midi (14 h – 17 h)'],
  ['fin-journee', 'Fin de journée (17 h 30 – 20 h)'],
] as const;

export function SlotForm({
  token,
  days,
}: {
  token: string;
  days: { value: string; label: string }[];
}) {
  const [state, action] = useActionState<SlotState, FormData>(
    chooseSlotAction.bind(null, token),
    null,
  );
  if (state?.ok) return <p className="notice">{state.ok}</p>;
  return (
    <form action={action} className="stack" style={{ gap: 18 }}>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
        <legend className="label">Jour</legend>
        {days.map((d) => (
          <label key={d.value} className="row" style={{ gap: 10, fontSize: 15 }}>
            <input type="radio" name="day" value={d.value} required /> {d.label}
          </label>
        ))}
      </fieldset>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
        <legend className="label">Moment</legend>
        {SLOTS.map(([v, label]) => (
          <label key={v} className="row" style={{ gap: 10, fontSize: 15 }}>
            <input type="radio" name="slot" value={v} required /> {label}
          </label>
        ))}
      </fieldset>
      {state?.error ? <p className="error">{state.error}</p> : null}
      <Submit />
    </form>
  );
}
