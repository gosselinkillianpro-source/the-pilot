'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { syncNowAction } from '@/lib/sync/actions';
import { useToast } from './toast';

/**
 * Bouton « Sync » de la barre du haut : déclenche une synchronisation SAH complète
 * immédiate (sans attendre le cron 15 min), puis rafraîchit la page.
 */
export function SyncButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = await syncNowAction();
      if (res.ok) {
        router.refresh();
        const base = `À jour : ${res.investors.toLocaleString('fr-FR')} investisseurs · ${res.subscriptions.toLocaleString('fr-FR')} souscriptions · ${res.projects.toLocaleString('fr-FR')} projets`;
        toast(res.errors.length ? `${base} — ${res.errors.length} erreur(s)` : base, {
          variant: res.errors.length ? 'info' : 'success',
          duration: 5000,
        });
      } else {
        toast(res.message, { variant: 'error' });
      }
    });
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      title="Rafraîchir toutes les données Seven At Home maintenant (sync complète)"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 32,
        padding: '0 12px',
        borderRadius: 8,
        background: 'var(--glass-bg-strong)',
        border: '1px solid var(--border)',
        color: 'var(--text-2)',
        fontSize: 12,
        fontWeight: 600,
        cursor: pending ? 'default' : 'pointer',
        whiteSpace: 'nowrap',
        opacity: pending ? 0.7 : 1,
      }}
    >
      <RefreshCw size={14} className={pending ? 'spin' : ''} />
      {pending ? 'Sync…' : 'Sync'}
    </button>
  );
}
