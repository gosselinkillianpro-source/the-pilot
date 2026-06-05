'use client';

import { Hand, LockOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import {
  claimLeadAction,
  releaseLeadAction,
} from '@/app/(dashboard)/closing/investor/[id]/actions';
import { useToast } from '@/components/shared/toast';

export function ClaimControl({
  investorId,
  claimedByMe,
}: {
  investorId: string;
  claimedByMe: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = claimedByMe
        ? await releaseLeadAction({ investorId })
        : await claimLeadAction({ investorId });
      if (res.ok) {
        router.refresh();
        toast(claimedByMe ? 'Lead libéré.' : 'Lead pris — à toi de jouer.', {
          variant: 'success',
          duration: 3000,
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
      className={`btn btn-sm ${claimedByMe ? 'btn-secondary' : 'btn-primary'}`}
    >
      {claimedByMe ? <LockOpen size={13} /> : <Hand size={13} />}
      {pending ? '…' : claimedByMe ? 'Libérer' : 'Je prends'}
    </button>
  );
}
