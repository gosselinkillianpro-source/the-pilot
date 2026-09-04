'use client';

import { ArrowRight, Hourglass, PhoneCall, PhoneOff, UserX, Voicemail, X } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { recordCallAction } from '@/app/(dashboard)/closing/session/actions';
import { useToast } from '@/components/shared/toast';
import { toDateTimeLocal } from '@/lib/closing/format';
import {
  type CallOutcome,
  CHOOSABLE_NEXT_ACTIONS,
  NEXT_ACTION_LABELS,
  type NextActionKind,
  proposeNextAction,
  REACHED_RESULTS,
  type ReachedResult,
} from '@/lib/closing/next-action';

/**
 * Le résultat d'un appel et sa suite, sur un seul écran (refonte du 4 sept.
 * 2026). Cinq résultats, quatre issues si joint, une suite pré-remplie que
 * le closer ne touche que pour la changer. Un seul bouton pour tout
 * enregistrer : timeline, étape, prochaine action, propriété, crédit.
 */

const OUTCOMES: { key: CallOutcome; label: string; icon: typeof PhoneCall; color: string }[] = [
  { key: 'reached', label: 'Joint·e', icon: PhoneCall, color: 'var(--success)' },
  { key: 'no_answer', label: 'Pas de réponse', icon: PhoneOff, color: 'var(--warning)' },
  { key: 'voicemail', label: 'Répondeur', icon: Voicemail, color: 'var(--text-3)' },
  { key: 'in_progress', label: 'En cours', icon: Hourglass, color: 'var(--brand)' },
  { key: 'wrong_number', label: 'Faux numéro', icon: X, color: 'var(--danger)' },
  { key: 'profile_incompatible', label: 'Pas pour lui/elle', icon: UserX, color: 'var(--danger)' },
];

const NO_CONTACT: ReadonlySet<CallOutcome> = new Set<CallOutcome>(['no_answer', 'voicemail']);

export function CallResultForm({
  investorId,
  name,
  missedAttempts,
  submitLabel = "Enregistrer l'appel",
  onSaved,
}: {
  investorId: string;
  name: string;
  /** Appels sans réponse depuis le dernier contact abouti, AVANT cet appel. */
  missedAttempts: number;
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const { toast, runWithActivity } = useToast();
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [reachedResult, setReachedResult] = useState<ReachedResult | null>(null);
  // La suite proposée reste maîtresse tant que le closer ne l'a pas touchée.
  const [customKind, setCustomKind] = useState<NextActionKind | null>(null);
  const [customDue, setCustomDue] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const proposal = useMemo(() => {
    if (!outcome) return null;
    return proposeNextAction({
      outcome,
      reachedResult,
      missedAttempts: NO_CONTACT.has(outcome) ? missedAttempts + 1 : missedAttempts,
      now: new Date(),
    });
  }, [outcome, reachedResult, missedAttempts]);

  const kind: NextActionKind = customKind ?? proposal?.kind ?? 'callback';
  const dueValue = customDue ?? (proposal?.dueAt ? toDateTimeLocal(proposal.dueAt) : '');
  const needsReachedResult = outcome === 'reached' && reachedResult == null;
  const canSubmit = outcome != null && !needsReachedResult && (kind === 'none' || dueValue !== '');

  function pickOutcome(o: CallOutcome) {
    setOutcome(o);
    setReachedResult(null);
    setCustomKind(null);
    setCustomDue(null);
  }

  function pickReached(r: ReachedResult) {
    setReachedResult(r);
    setCustomKind(null);
    setCustomDue(null);
  }

  function reset() {
    setOutcome(null);
    setReachedResult(null);
    setCustomKind(null);
    setCustomDue(null);
    setNote('');
  }

  function submit() {
    if (!outcome || !canSubmit) return;
    const chosenOutcome = outcome;
    const chosenResult = reachedResult ?? undefined;
    const chosenKind = kind;
    const dueIso =
      chosenKind === 'none' || !dueValue ? undefined : new Date(dueValue).toISOString();
    startTransition(async () => {
      const res = await runWithActivity(`Enregistrement de l'appel — ${name}`, () =>
        recordCallAction({
          investorId,
          outcome: chosenOutcome,
          reachedResult: chosenResult,
          next: { kind: chosenKind, dueAt: dueIso },
          note: note.trim() || undefined,
        }),
      );
      if (!res.ok) {
        toast(res.message, { variant: 'error' });
        return;
      }
      const parts = ['Appel enregistré.'];
      if (res.nextLabel) parts.push(`Suite : ${res.nextLabel}.`);
      if (res.moved) parts.push(res.moved.reason);
      toast(parts.join(' '), { variant: 'success', duration: 4500 });
      reset();
      onSaved?.();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <Label>Résultat</Label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {OUTCOMES.map((o) => {
            const Icon = o.icon;
            const active = outcome === o.key;
            return (
              <button
                key={o.key}
                type="button"
                className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => pickOutcome(o.key)}
                style={active ? undefined : { color: o.color }}
                aria-pressed={active}
              >
                <Icon size={13} />
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {outcome === 'reached' ? (
        <div>
          <Label>Ce qui s'est dit</Label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {REACHED_RESULTS.map((r) => {
              const active = reachedResult === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => pickReached(r.key)}
                  style={!active && r.key === 'refused' ? { color: 'var(--danger)' } : undefined}
                  aria-pressed={active}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {proposal && !needsReachedResult ? (
        <div
          style={{
            border: '1px solid var(--brand)',
            background: 'var(--brand-bg)',
            borderRadius: 10,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <Label>Et ensuite ?</Label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="input"
              value={kind}
              onChange={(e) => setCustomKind(e.target.value as NextActionKind)}
              aria-label="Suite à donner"
              style={{ minWidth: 200 }}
            >
              {CHOOSABLE_NEXT_ACTIONS.map((k) => (
                <option key={k} value={k}>
                  {NEXT_ACTION_LABELS[k]}
                </option>
              ))}
            </select>
            {kind !== 'none' ? (
              <input
                type="datetime-local"
                className="input"
                value={dueValue}
                onChange={(e) => setCustomDue(e.target.value)}
                aria-label="Quand"
              />
            ) : null}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{proposal.reason}</span>
        </div>
      ) : null}

      <textarea
        className="input"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (facultatif) — ce qui s'est dit, ce qu'il faut retenir"
        style={{ resize: 'vertical', fontFamily: 'inherit' }}
        aria-label="Note"
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={pending || !canSubmit}
        >
          {submitLabel}
          <ArrowRight size={14} />
        </button>
        {needsReachedResult ? (
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Dis ce qui s'est dit pour pré-remplir la suite.
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Label({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: 'var(--text-4)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}
