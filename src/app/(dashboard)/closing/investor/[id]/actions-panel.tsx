'use client';

import { CalendarPlus, CheckSquare, Mail, MessageSquare, Phone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import {
  cancelTaskAction,
  completeTaskAction,
  planActionAction,
  reopenTaskAction,
} from './actions';

type ActionType = 'callback' | 'email' | 'message' | 'todo';

const TYPES: { value: ActionType; label: string; icon: React.ReactNode }[] = [
  { value: 'callback', label: 'Rappel', icon: <Phone size={13} /> },
  { value: 'email', label: 'Email', icon: <Mail size={13} /> },
  { value: 'message', label: 'Message', icon: <MessageSquare size={13} /> },
  { value: 'todo', label: 'Tâche', icon: <CheckSquare size={13} /> },
];

/** Formulaire « Planifier une action » (rappel / email / message / tâche) sur la fiche. */
export function PlanActionPanel({ investorId }: { investorId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<ActionType>('callback');
  const [dueAt, setDueAt] = useState('');
  const [note, setNote] = useState('');

  function submit() {
    if (!dueAt) {
      toast('Choisis une date et une heure.', { variant: 'error' });
      return;
    }
    startTransition(async () => {
      const res = await planActionAction({
        investorId,
        type,
        dueAt: new Date(dueAt).toISOString(),
        note: note.trim() || undefined,
      });
      if (res.ok) {
        const label = TYPES.find((t) => t.value === type)?.label ?? 'Action';
        toast(`${label} planifié.`, { variant: 'success' });
        setNote('');
        setDueAt('');
        router.refresh();
      } else {
        toast(res.message, { variant: 'error' });
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={`btn btn-sm ${type === t.value ? 'btn-primary' : 'btn-secondary'}`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Quand ?</span>
          <input
            type="datetime-local"
            className="input"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </label>
        <textarea
          className="input"
          placeholder="Note (ex. « rappeler après réception du DIC », « relancer sur le projet X »…)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>
      <button
        type="button"
        className="btn btn-primary"
        onClick={submit}
        disabled={pending}
        style={{ alignSelf: 'flex-start' }}
      >
        <CalendarPlus size={14} />
        {pending ? 'Planification…' : "Planifier l'action"}
      </button>
    </div>
  );
}

/** Boutons d'une action planifiée : « Fait » (annulable) et « Supprimer » (annulable). */
export function ActionRowButtons({ taskId, label }: { taskId: string; label?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function markDone() {
    startTransition(async () => {
      const res = await completeTaskAction({ taskId });
      if (!res.ok) {
        toast(res.message, { variant: 'error' });
        return;
      }
      router.refresh();
      toast(label ? `Fait : ${label}.` : 'Action marquée comme faite.', {
        variant: 'success',
        undo: {
          onUndo: async () => {
            const back = await reopenTaskAction({ taskId });
            if (!back.ok) throw new Error(back.message);
            router.refresh();
          },
        },
      });
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await cancelTaskAction({ taskId });
      if (!res.ok) {
        toast(res.message, { variant: 'error' });
        return;
      }
      router.refresh();
      toast('Action supprimée.', {
        variant: 'info',
        undo: {
          onUndo: async () => {
            const back = await reopenTaskAction({ taskId });
            if (!back.ok) throw new Error(back.message);
            router.refresh();
          },
        },
      });
    });
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={markDone}
        disabled={pending}
      >
        Fait
      </button>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={remove}
        disabled={pending}
        style={{ color: 'var(--danger)' }}
      >
        Supprimer
      </button>
    </div>
  );
}
