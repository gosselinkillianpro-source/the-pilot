'use client';

import { Check, PhoneCall } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import { type LogCallInput, logCallAction } from './actions';

type Outcome = LogCallInput['outcome'];

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: 'reached', label: 'Joint' },
  { value: 'no_answer', label: 'Pas de réponse' },
  { value: 'voicemail', label: 'Répondeur' },
  { value: 'wrong_number', label: 'Mauvais numéro' },
];

const STAGES: { value: NonNullable<LogCallInput['nextStage']>; label: string }[] = [
  { value: 'contacted', label: 'Contacté' },
  { value: 'meeting_booked', label: 'RDV pris' },
  { value: 'meeting_done', label: 'RDV fait' },
  { value: 'proposal_sent', label: 'Proposition envoyée' },
  { value: 'closed_won', label: 'Gagné' },
  { value: 'closed_lost', label: 'Perdu' },
  { value: 'dormant', label: 'En sommeil' },
];

export function CallLogPanel({ investorId }: { investorId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<Outcome>('reached');
  const [note, setNote] = useState('');
  const [nextStage, setNextStage] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function submit() {
    setMsg(null);
    startTransition(async () => {
      const input: LogCallInput = {
        investorId,
        outcome,
        note: note.trim() || undefined,
        nextStage: nextStage ? (nextStage as LogCallInput['nextStage']) : undefined,
        callbackAt: callbackAt ? new Date(callbackAt).toISOString() : undefined,
      };
      const res = await logCallAction(input);
      if (res.ok) {
        setMsg({ ok: true, text: 'Appel enregistré.' });
        setNote('');
        setNextStage('');
        setCallbackAt('');
        router.refresh();
        toast('Appel enregistré.', { variant: 'success' });
      } else {
        setMsg({ ok: false, text: res.message });
        toast(res.message, { variant: 'error' });
      }
    });
  }

  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PhoneCall size={15} />
          Enregistrer un appel
        </div>
      </div>
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Résultat */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {OUTCOMES.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setOutcome(o.value)}
              className={`btn btn-sm ${outcome === o.value ? 'btn-primary' : 'btn-secondary'}`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Notes */}
        <textarea
          className="input"
          placeholder="Notes d'appel (compte-rendu, objections, prochaine étape…)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />

        {/* Avancement + rappel */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Faire avancer (optionnel)</span>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={pending}
            style={{ alignSelf: 'flex-start' }}
          >
            <Check size={14} />
            {pending ? 'Enregistrement…' : "Enregistrer l'appel"}
          </button>
          {msg && (
            <span style={{ fontSize: 12, color: msg.ok ? 'var(--success)' : 'var(--danger)' }}>
              {msg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
