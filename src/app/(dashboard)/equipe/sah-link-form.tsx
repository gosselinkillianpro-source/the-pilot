'use client';

import { Link2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import { linkUserToSahAction } from './actions';

/**
 * Relier un closer à son compte SAH (CGP). Dès l'enregistrement, ses inscrits
 * libres (code bonus à lui) lui sont attribués ; les suivants arrivent à chaque
 * synchro. Admin seulement (le composant n'est rendu que sur la page Équipe).
 */
export function SahLinkForm({
  userId,
  initial,
  cgpClients,
}: {
  userId: string;
  initial: string | null;
  cgpClients: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(initial ?? '');
  const dirty = (value.trim() || '') !== (initial ?? '');

  function save() {
    startTransition(async () => {
      const res = await linkUserToSahAction({ userId, sahUserId: value.trim() });
      if (!res.ok) {
        toast(res.message, { variant: 'error' });
        return;
      }
      toast(
        res.sahUserId
          ? `Relié au compte SAH ${res.sahUserId} : ${res.assigned} client${res.assigned > 1 ? 's' : ''} attribué${res.assigned > 1 ? 's' : ''} maintenant (${res.total} au total avec ce code).`
          : 'Compte SAH délié. Ses clients déjà attribués lui restent.',
        { variant: 'success', duration: 7000 },
      );
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        style={{
          fontSize: 10,
          color: 'var(--text-4)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <Link2 size={11} />
        Compte SAH (CGP)
        {initial ? (
          <span style={{ marginLeft: 'auto', color: 'var(--text-3)' }}>
            {cgpClients} client{cgpClients > 1 ? 's' : ''} CGP
          </span>
        ) : null}
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="n° SAH, ex. 1315"
          inputMode="numeric"
          style={{ fontSize: 12, height: 30, flex: 1 }}
          aria-label="Identifiant SAH du closer"
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={save}
          disabled={pending || !dirty}
        >
          {pending ? '…' : 'Relier'}
        </button>
      </div>
    </div>
  );
}
