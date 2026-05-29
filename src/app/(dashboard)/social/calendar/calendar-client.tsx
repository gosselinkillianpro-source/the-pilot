'use client';

import { Plus, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addContextNoteAction, deleteContextNoteAction, updateContextNoteAction } from './actions';

export function AddNoteForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        <Plus size={14} /> Ajouter une note
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        className="input"
        placeholder="Titre (ex. Vision 2026, Angle à pousser…)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="textarea"
        rows={4}
        placeholder="Texte libre injecté dans le contexte de génération…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={pending || !title || !content}
          onClick={() =>
            startTransition(async () => {
              await addContextNoteAction({ title, content });
              setTitle('');
              setContent('');
              setOpen(false);
              router.refresh();
            })
          }
        >
          <Save size={14} /> Enregistrer
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Annuler
        </button>
      </div>
    </div>
  );
}

export function NoteEditor({
  id,
  initialTitle,
  initialContent,
}: {
  id: string;
  initialTitle: string;
  initialContent: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [pending, startTransition] = useTransition();
  const dirty = title !== initialTitle || content !== initialContent;

  return (
    <div className="view-card">
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          className="textarea"
          rows={4}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pending || !dirty}
            onClick={() =>
              startTransition(async () => {
                await updateContextNoteAction({ id, title, content });
                router.refresh();
              })
            }
          >
            <Save size={14} /> Sauver
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={() => {
              if (confirm('Supprimer cette note ?'))
                startTransition(async () => {
                  await deleteContextNoteAction(id);
                  router.refresh();
                });
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
