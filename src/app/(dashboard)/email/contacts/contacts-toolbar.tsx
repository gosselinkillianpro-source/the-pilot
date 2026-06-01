'use client';

import { ListPlus, Search, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createContactAction, createListAction } from './actions';

type ListOption = { id: number; name: string };

export function ContactsToolbar({
  lists,
  initialQuery,
}: {
  lists: ListOption[];
  initialQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [panel, setPanel] = useState<'none' | 'contact' | 'list'>('none');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Nouveau contact
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [listId, setListId] = useState<number | ''>('');

  // Nouvelle liste
  const [listName, setListName] = useState('');

  function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/email/contacts?q=${encodeURIComponent(q)}` : '/email/contacts');
  }

  function submitContact() {
    setMsg(null);
    startTransition(async () => {
      const res = await createContactAction({
        email: email.trim(),
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        listIds: listId === '' ? undefined : [listId],
      });
      if (res.ok) {
        setMsg({ kind: 'ok', text: 'Contact enregistré.' });
        setEmail('');
        setFirstName('');
        setLastName('');
        setListId('');
        setPanel('none');
        router.refresh();
      } else {
        setMsg({ kind: 'err', text: res.message });
      }
    });
  }

  function submitList() {
    setMsg(null);
    startTransition(async () => {
      const res = await createListAction({ name: listName.trim() });
      if (res.ok) {
        setMsg({ kind: 'ok', text: 'Liste créée.' });
        setListName('');
        setPanel('none');
        router.refresh();
      } else {
        setMsg({ kind: 'err', text: res.message });
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <form onSubmit={search} style={{ display: 'flex', gap: 6, flex: 1, minWidth: 240 }}>
          <input
            className="input"
            placeholder="Rechercher par email exact…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary btn-sm" aria-label="Rechercher">
            <Search size={14} />
          </button>
        </form>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setPanel(panel === 'contact' ? 'none' : 'contact')}
        >
          <UserPlus size={14} />
          Nouveau contact
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setPanel(panel === 'list' ? 'none' : 'list')}
        >
          <ListPlus size={14} />
          Nouvelle liste
        </button>
      </div>

      {panel === 'contact' && (
        <div
          className="view-card"
          style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
            <input
              className="input"
              placeholder="email@exemple.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="input"
              placeholder="Prénom"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <input
              className="input"
              placeholder="Nom"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="select"
              value={listId}
              onChange={(e) => setListId(e.target.value === '' ? '' : Number(e.target.value))}
              style={{ maxWidth: 280 }}
            >
              <option value="">Aucune liste</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={submitContact}
              disabled={pending || !email.trim()}
            >
              {pending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {panel === 'list' && (
        <div
          className="view-card"
          style={{ padding: 16, display: 'flex', gap: 8, alignItems: 'center' }}
        >
          <input
            className="input"
            placeholder="Nom de la nouvelle liste"
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            style={{ maxWidth: 320 }}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={submitList}
            disabled={pending || !listName.trim()}
          >
            {pending ? 'Création…' : 'Créer la liste'}
          </button>
        </div>
      )}

      {msg && (
        <p
          style={{
            fontSize: 12,
            margin: 0,
            color: msg.kind === 'ok' ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
