'use client';

import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import { completeTaskAction, reopenTaskAction } from '../investor/[id]/actions';

export function TaskDoneButton({ taskId, label }: { taskId: string; label?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await completeTaskAction({ taskId });
          if (!res.ok) {
            toast(res.message, { variant: 'error' });
            return;
          }
          router.refresh();
          toast(label ? `Fait : ${label}.` : 'Tâche marquée comme faite.', {
            variant: 'success',
            undo: {
              onUndo: async () => {
                const back = await reopenTaskAction({ taskId });
                if (!back.ok) throw new Error(back.message);
                router.refresh();
              },
            },
          });
        })
      }
    >
      <Check size={13} />
      {pending ? '…' : 'Fait'}
    </button>
  );
}
