'use client';

import { Radar, Sparkles, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { competitorToIdeasAction, deleteReportAction, runCompetitorWatchAction } from './actions';

export function RunWatchButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {err && (
        <span className="badge badge-danger" title={err}>
          {err.slice(0, 40)}
        </span>
      )}
      <button
        type="button"
        className="btn btn-ai"
        disabled={pending}
        onClick={() => {
          setErr(null);
          startTransition(async () => {
            const res = await runCompetitorWatchAction();
            if (!res.ok) setErr(res.message);
            else router.refresh();
          });
        }}
      >
        <Radar size={14} />
        {pending ? 'Analyse en cours…' : 'Lancer une veille'}
      </button>
    </div>
  );
}

export function ReportActions({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {msg && <span className="badge badge-success">{msg}</span>}
      <button
        type="button"
        className="btn btn-ai btn-sm"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          startTransition(async () => {
            const res = await competitorToIdeasAction({ reportId, n: 5 });
            if (res.ok) {
              setMsg(`${res.inserted} idées`);
              router.refresh();
            } else {
              setMsg(res.message.slice(0, 30));
            }
          });
        }}
      >
        <Sparkles size={14} /> Inspirer 5 idées
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={pending}
        onClick={() => {
          if (confirm('Supprimer ce rapport ?'))
            startTransition(async () => {
              await deleteReportAction(reportId);
              router.refresh();
            });
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
