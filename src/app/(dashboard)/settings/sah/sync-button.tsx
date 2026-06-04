'use client';

import { RefreshCw } from 'lucide-react';
import { useState, useTransition } from 'react';
import { type SahSyncActionResult, triggerSahSyncAction } from './actions';

export function SyncButton() {
  const [pending, startTransition] = useTransition();
  const [res, setRes] = useState<SahSyncActionResult | null>(null);

  function run() {
    setRes(null);
    startTransition(async () => {
      setRes(await triggerSahSyncAction());
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button
        type="button"
        className="btn btn-primary"
        onClick={run}
        disabled={pending}
        style={{ alignSelf: 'flex-start' }}
      >
        <RefreshCw size={14} />
        {pending ? 'Synchronisation en cours…' : 'Lancer la synchronisation SAH'}
      </button>

      {res?.ok && (
        <p style={{ fontSize: 13, color: 'var(--success)', margin: 0 }}>
          ✓ Synchro terminée : <strong>{res.result.investors}</strong> investisseurs ·{' '}
          <strong>{res.result.projects}</strong> projets ·{' '}
          <strong>{res.result.subscriptions}</strong> souscriptions.
          {res.result.errors.length > 0 && (
            <span style={{ color: 'var(--danger)' }}>
              {' '}
              Erreurs : {res.result.errors.join(' · ')}
            </span>
          )}
        </p>
      )}
      {res && !res.ok && (
        <p style={{ fontSize: 13, color: 'var(--danger)', margin: 0 }}>{res.message}</p>
      )}
    </div>
  );
}
