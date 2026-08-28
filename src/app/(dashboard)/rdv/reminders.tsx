'use client';

import { BellPlus, Check, Clock3 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import type { Reminder, ReminderTarget } from '@/lib/db/queries/reminders';
import { completeReminderAction, createReminderAction } from './actions';

/**
 * Les rappels : en créer un, voir ceux qui arrivent, les clore.
 *
 * Les retards sont en tête et en rouge — ce sont eux qu'on oublie, et chaque
 * jour de retard coûte une chance de joindre la personne.
 */

function fmtWhen(d: Date): string {
  const jours = Math.round((new Date(d).getTime() - Date.now()) / 86_400_000);
  const heure = new Date(d).toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (jours < 0) return `${heure} · en retard`;
  if (jours === 0) return `${heure} · aujourd'hui`;
  return heure;
}

/** Valeur `datetime-local` par défaut : demain 10 h, l'heure de rappel la plus courante. */
function defaultDue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function Reminders({
  reminders,
  targets,
}: {
  reminders: Reminder[];
  targets: ReminderTarget[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [dueAt, setDueAt] = useState(defaultDue);
  const [note, setNote] = useState('');

  function create() {
    const target = targets.find((t) => t.id === targetId);
    if (!target) {
      toast('Choisis la personne à rappeler.', { variant: 'error' });
      return;
    }
    startTransition(async () => {
      const res = await createReminderAction({
        targetId: target.id,
        targetKind: target.kind,
        // `datetime-local` donne une heure locale sans fuseau : on la convertit
        // ici, côté navigateur, sinon un rappel de 10 h serait posé à 8 h UTC.
        dueAt: new Date(dueAt).toISOString(),
        note: note.trim() || undefined,
      });
      if (res.success) {
        setOpen(false);
        setNote('');
        router.refresh();
        toast('Rappel créé — il apparaît dans ton agenda.', { variant: 'success' });
      } else {
        toast(res.error ?? 'Création impossible', { variant: 'error' });
      }
    });
  }

  function complete(r: Reminder) {
    startTransition(async () => {
      const res = await completeReminderAction({ reminderId: r.id });
      if (res.success) {
        router.refresh();
        toast('Rappel classé.', { variant: 'success' });
      } else {
        toast(res.error ?? 'Action impossible', { variant: 'error' });
      }
    });
  }

  const late = reminders.filter((r) => r.overdue);
  const soon = reminders.filter((r) => !r.overdue);

  return (
    <div className="view-card">
      <div className="view-card-header">
        <div>
          <div className="view-card-title">
            <Clock3 size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            Rappels
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 2 }}>
            {reminders.length === 0
              ? 'Aucun rappel en attente.'
              : `${reminders.length} en attente${late.length > 0 ? ` · ${late.length} en retard` : ''}`}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <BellPlus size={13} />
          Nouveau rappel
        </button>
      </div>

      {open && (
        <div
          className="view-card-body"
          style={{ borderBottom: '1px solid var(--border)', display: 'grid', gap: 8 }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Qui rappeler</span>
            <select
              className="input"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">— choisir —</option>
              {targets.map((t) => (
                <option key={`${t.kind}-${t.id}`} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Quand</span>
              <input
                className="input"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Pourquoi (optionnel)</span>
              <input
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Relancer sur le projet Moirans"
              />
            </label>
          </div>
          <div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={pending}
              onClick={create}
            >
              Créer le rappel
            </button>
          </div>
        </div>
      )}

      <div className="view-card-body" style={{ padding: 0 }}>
        {reminders.length === 0 ? (
          <div style={{ padding: 16, fontSize: 13, color: 'var(--text-3)' }}>
            Rien à rappeler pour l'instant. Un rappel créé ici apparaît aussi dans ton agenda et
            dans le cockpit « Aujourd'hui ».
          </div>
        ) : (
          [...late, ...soon].map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 16px',
                borderBottom: '1px solid var(--border)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                  {r.who ?? 'Contact'}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: r.overdue ? 'var(--danger)' : 'var(--text-3)',
                  }}
                >
                  {fmtWhen(r.dueAt)}
                  {r.note ? ` · ${r.note}` : ''}
                </div>
              </div>
              {r.phone && (
                <a href={`tel:${r.phone}`} className="btn btn-ghost btn-sm">
                  {r.phone}
                </a>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={pending}
                onClick={() => complete(r)}
              >
                <Check size={13} />
                Fait
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
