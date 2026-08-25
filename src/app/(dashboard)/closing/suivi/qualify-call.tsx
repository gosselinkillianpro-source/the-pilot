'use client';

import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { qualifyCallAction } from '@/app/(dashboard)/closing/investor/[id]/actions';
import { useToast } from '@/components/shared/toast';
import { CLOSING_STAGE_LABELS, type ClosingStage } from '@/lib/closing/pipeline';

type Outcome = 'reached' | 'no_answer' | 'voicemail' | 'wrong_number';

const OUTCOMES: { value: Outcome; label: string; primary?: boolean }[] = [
  { value: 'reached', label: 'Joint', primary: true },
  { value: 'no_answer', label: 'Pas de réponse' },
  { value: 'voicemail', label: 'Répondeur' },
  { value: 'wrong_number', label: 'Mauvais numéro' },
];

/**
 * Étapes proposées à la main. Elles PRIMENT sur le rangement automatique :
 * un closer qui a eu la personne au téléphone en sait plus que la règle.
 * Ordre et libellés viennent du module de suivi — un seul vocabulaire.
 */
const STAGES: { value: string; label: string }[] = [
  'to_call_back',
  'interested',
  'meeting_booked',
  'meeting_done',
  'proposal_sent',
  'closed_won',
  'closed_lost',
  'dormant',
].map((value) => ({ value, label: CLOSING_STAGE_LABELS[value as ClosingStage] }));

/** Qualifie un appel passé : résultat en 1 clic + détails optionnels (note, étape, rappel). */
export function QualifyCall({ callId, name }: { callId: string; name: string }) {
  const router = useRouter();
  const { toast, runWithActivity } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [nextStage, setNextStage] = useState('');
  const [callbackAt, setCallbackAt] = useState('');

  function qualify(outcome: Outcome) {
    startTransition(async () => {
      const res = await runWithActivity(`Qualification de l'appel — ${name}`, () =>
        qualifyCallAction({
          callId,
          outcome,
          note: note.trim() || undefined,
          nextStage: nextStage || undefined,
          callbackAt: callbackAt ? new Date(callbackAt).toISOString() : undefined,
        }),
      );
      if (res.ok) {
        const label = OUTCOMES.find((o) => o.value === outcome)?.label ?? '';
        // On dit OÙ la personne vient d'être rangée : c'est tout l'objet du
        // suivi, et sans ce retour l'automatisme resterait invisible.
        const where = res.moved
          ? ` → ${CLOSING_STAGE_LABELS[res.moved.stage as ClosingStage] ?? res.moved.stage}. ${res.moved.reason}`
          : '';
        toast(`Appel qualifié (${label}) — ${name}.${where}`, { variant: 'success' });
        router.refresh();
      } else {
        toast(res.message, { variant: 'error' });
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {OUTCOMES.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={pending}
            onClick={() => qualify(o.value)}
            className={`btn btn-sm ${o.primary ? 'btn-primary' : 'btn-secondary'}`}
          >
            {o.label}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title="Ajouter une note, une étape ou un rappel"
        >
          <ChevronDown
            size={13}
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
          />
          Détails
        </button>
      </div>

      {open && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 10,
            borderRadius: 8,
            background: 'var(--glass-bg)',
            border: '1px solid var(--border)',
          }}
        >
          <textarea
            className="input"
            placeholder="Note d'appel (compte-rendu, objections, prochaine étape…)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Faire avancer (option)</span>
              <select
                className="input"
                value={nextStage}
                onChange={(e) => setNextStage(e.target.value)}
              >
                <option value="">— inchangé —</option>
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Programmer un rappel</span>
              <input
                type="datetime-local"
                className="input"
                value={callbackAt}
                onChange={(e) => setCallbackAt(e.target.value)}
              />
            </label>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
            Choisis un résultat ci-dessus pour enregistrer (la note / l'étape / le rappel seront
            joints).
          </span>
        </div>
      )}
    </div>
  );
}
