'use client';

import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { markCalledAction } from '@/app/(dashboard)/closing/investor/[id]/actions';

/** Bouton rapide : marque la personne comme appelée → la retire de la file. */
export function MarkCalledButton({ investorId }: { investorId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-sm btn-secondary"
      disabled={pending}
      title="Marquer comme appelé (retire de la liste)"
      onClick={() =>
        startTransition(async () => {
          await markCalledAction({ investorId });
          router.refresh();
        })
      }
    >
      <Check size={13} />
      {pending ? '…' : 'Appelé'}
    </button>
  );
}
