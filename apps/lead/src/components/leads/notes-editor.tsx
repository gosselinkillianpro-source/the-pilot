'use client';

import { useState, useTransition } from 'react';
import { saveNotesAction } from '@/app/(app)/leads/[id]/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';

export function NotesEditor({
  leadId,
  initial,
  editable,
}: {
  leadId: string;
  initial: string;
  editable: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const toast = useToast();
  const dirty = value !== saved;

  function save() {
    if (!dirty) return;
    start(async () => {
      const r = await saveNotesAction(leadId, value);
      if (r.ok) setSaved(value);
      else toast.push(r.error, 'error');
    });
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        disabled={!editable}
        placeholder="Ce que dit le lead, ce qu’il faut savoir pour le rendez-vous. Jamais de produit ni de partenaire."
      />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="hint">
          {pending ? 'Enregistrement…' : dirty ? 'Modifications non enregistrées' : 'Enregistré'}
        </span>
        <Button size="sm" onClick={save} disabled={!dirty || pending || !editable}>
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
