'use client';

import { Check, StickyNote } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import { saveInternalNoteAction } from './actions';

/**
 * Bloc-notes persistant par personne (investors.internal_note). Sauvegarde au clic
 * en dehors du champ (blur) et via le bouton ; un badge indique l'état (à jour / non
 * enregistré). Les notes restent en mémoire d'une visite à l'autre.
 */
export function InvestorNotes({
  investorId,
  initialNote,
}: {
  investorId: string;
  initialNote: string;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState(initialNote);
  const [savedValue, setSavedValue] = useState(initialNote);
  const dirty = note !== savedValue;

  function save() {
    if (!dirty) return;
    const toSave = note;
    startTransition(async () => {
      const res = await saveInternalNoteAction({ investorId, note: toSave });
      if (res.ok) {
        setSavedValue(toSave);
        toast('Note enregistrée.', { variant: 'success', duration: 3000 });
      } else {
        toast(res.message, { variant: 'error' });
      }
    });
  }

  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StickyNote size={15} />
          Notes
        </div>
        {dirty ? (
          <span className="badge badge-warning" style={{ fontSize: 10 }}>
            non enregistré
          </span>
        ) : (
          <span className="badge badge-success" style={{ fontSize: 10 }}>
            à jour
          </span>
        )}
      </div>
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          className="input"
          placeholder="Notes libres sur cette personne (contexte, préférences, historique…). Conservées en mémoire."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={save}
          rows={5}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />
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
      </div>
    </div>
  );
}
