'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { CloserOption } from '@/lib/db/queries/closing';
import { assignCloserAction } from './actions';

export function AssignCloser({
  investorId,
  current,
  closers,
}: {
  investorId: string;
  current: string | null;
  closers: CloserOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <select
        className="input"
        defaultValue={current ?? ''}
        disabled={pending}
        style={{ fontSize: 12 }}
        onChange={(e) => {
          const v = e.target.value;
          setErr(null);
          startTransition(async () => {
            const res = await assignCloserAction({ investorId, closerId: v || null });
            if (!res.ok) setErr(res.message);
            else router.refresh();
          });
        }}
      >
        <option value="">— Non assigné —</option>
        {closers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name ?? c.id} ({c.role})
          </option>
        ))}
      </select>
      {err && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{err}</span>}
    </div>
  );
}
