'use client';

import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { markCalledAction, undoCallAction } from '@/app/(dashboard)/closing/investor/[id]/actions';
import { useToast } from '@/components/shared/toast';

/**
 * Bouton rapide « Appelé » : enregistre l'appel (sans résultat encore), retire la
 * personne de la file et l'envoie dans « Suivi » pour qualifier plus tard.
 * Confirmation + bouton « Annuler » pendant 6 s (annule l'appel et la remet en file).
 */
export function MarkCalledButton({ investorId, name }: { investorId: string; name?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-sm btn-secondary"
      disabled={pending}
      title="Marquer comme appelé (part dans Suivi pour qualifier le résultat)"
      onClick={() =>
        startTransition(async () => {
          const res = await markCalledAction({ investorId });
          if (!res.ok) {
            toast(res.message, { variant: 'error' });
            return;
          }
          router.refresh();
          toast(`${name ?? 'Personne'} marqué comme appelé · à qualifier dans Suivi.`, {
            variant: 'success',
            undo: {
              onUndo: async () => {
                const back = await undoCallAction({
                  interactionId: res.interactionId,
                  unassign: res.assignedNow,
                });
                if (!back.ok) throw new Error(back.message);
                router.refresh();
              },
            },
          });
        })
      }
    >
      <Check size={13} />
      {pending ? '…' : 'Appelé'}
    </button>
  );
}
