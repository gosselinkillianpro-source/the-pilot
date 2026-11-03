'use client';

import { useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import { PROCESSING, PROCESSING_CODES, type ProcessingStatus } from '@/lib/club-deal/constants';
import { updateClubDealAction } from './actions';
import { STATUS_TONE } from './tones';

/**
 * Changement du statut de traitement. `compact` = liste déroulante (tableau) ;
 * sinon une rangée de boutons (fiche). Optimiste : revient en arrière si l'enregistrement échoue.
 */
export function StatusControl({
  id,
  initial,
  compact = false,
  disabled = false,
}: {
  id: number;
  initial: ProcessingStatus;
  compact?: boolean;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<ProcessingStatus>(initial);

  function change(next: ProcessingStatus) {
    if (next === status) return;
    const previous = status;
    setStatus(next);
    startTransition(async () => {
      const res = await updateClubDealAction({ id, processingStatus: next });
      if (res.ok) {
        toast(`Statut : ${PROCESSING[next]}`, { variant: 'success', duration: 2500 });
      } else {
        setStatus(previous);
        toast(res.message, { variant: 'error', duration: 8000 });
      }
    });
  }

  if (compact) {
    return (
      <select
        className="select"
        aria-label="Statut de traitement"
        value={status}
        disabled={disabled || pending}
        onChange={(e) => change(e.target.value as ProcessingStatus)}
        onClick={(e) => e.stopPropagation()}
        style={{ height: 30, fontSize: 12, minWidth: 140 }}
      >
        {PROCESSING_CODES.map((c) => (
          <option key={c} value={c}>
            {PROCESSING[c]}
          </option>
        ))}
      </select>
    );
  }

  return (
    <fieldset
      aria-label="Statut de traitement"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        border: 0,
        margin: 0,
        padding: 0,
        minWidth: 0,
      }}
    >
      {PROCESSING_CODES.map((c) => {
        const active = c === status;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={active}
            disabled={disabled || pending}
            onClick={() => change(c)}
            className={`btn btn-sm ${active ? '' : 'btn-secondary'}`}
            style={
              active
                ? { background: STATUS_TONE[c].solid, color: '#fff', borderColor: 'transparent' }
                : undefined
            }
          >
            {PROCESSING[c]}
          </button>
        );
      })}
    </fieldset>
  );
}
