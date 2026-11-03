'use client';

import { Check, StickyNote } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import { updateClubDealAction } from './actions';

/** Notes internes d'une demande : sauvegarde au blur et au bouton (même usage que la fiche investisseur). */
export function NotesEditor({
  id,
  initialNotes,
  readOnly = false,
}: {
  id: number;
  initialNotes: string;
  readOnly?: boolean;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState(initialNotes);
  const [saved, setSaved] = useState(initialNotes);
  const dirty = notes !== saved;

  function save() {
    if (!dirty || readOnly) return;
    const toSave = notes;
    startTransition(async () => {
      const res = await updateClubDealAction({ id, notes: toSave });
      if (res.ok) {
        setSaved(toSave);
        toast('Notes enregistrées.', { variant: 'success', duration: 2500 });
      } else {
        toast(res.message, { variant: 'error', duration: 8000 });
      }
    });
  }

  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StickyNote size={15} />
          Notes internes
        </div>
        {!readOnly && (
          <span
            className={`badge ${dirty ? 'badge-warning' : 'badge-success'}`}
            style={{ fontSize: 10 }}
          >
            {dirty ? 'non enregistré' : 'à jour'}
          </span>
        )}
      </div>
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          className="input"
          aria-label="Notes internes"
          placeholder="Appel, dossier envoyé, répartition entre les dossiers… (jamais visible par l'investisseur)"
          value={notes}
          readOnly={readOnly}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={save}
          rows={6}
          maxLength={4000}
          style={{ resize: 'vertical', fontFamily: 'inherit', minHeight: 120, padding: 10 }}
        />
        {!readOnly && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={save}
            disabled={pending || !dirty}
            style={{ alignSelf: 'flex-start' }}
          >
            <Check size={13} />
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        )}
      </div>
    </div>
  );
}
