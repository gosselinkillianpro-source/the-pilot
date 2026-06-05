'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
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
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <select
      className="input"
      defaultValue={current ?? ''}
      disabled={pending}
      style={{ fontSize: 12 }}
      onChange={(e) => {
        const v = e.target.value;
        startTransition(async () => {
          const res = await assignCloserAction({ investorId, closerId: v || null });
          if (res.ok) {
            router.refresh();
            toast(v ? 'Closer assigné.' : 'Assignation retirée.', {
              variant: 'success',
              duration: 3000,
            });
          } else {
            toast(res.message, { variant: 'error' });
          }
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
  );
}
