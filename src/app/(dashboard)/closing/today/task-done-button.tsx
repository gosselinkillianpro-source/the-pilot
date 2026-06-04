'use client';

import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { completeTaskAction } from '../investor/[id]/actions';

export function TaskDoneButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await completeTaskAction({ taskId });
          router.refresh();
        })
      }
    >
      <Check size={13} />
      {pending ? '…' : 'Fait'}
    </button>
  );
}
