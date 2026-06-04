'use client';

import { Hand, LockOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  claimLeadAction,
  releaseLeadAction,
} from '@/app/(dashboard)/closing/investor/[id]/actions';

export function ClaimControl({
  investorId,
  claimedByMe,
}: {
  investorId: string;
  claimedByMe: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run() {
    setErr(null);
    startTransition(async () => {
      const res = claimedByMe
        ? await releaseLeadAction({ investorId })
        : await claimLeadAction({ investorId });
      if (!res.ok) setErr(res.message);
      else router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={`btn btn-sm ${claimedByMe ? 'btn-secondary' : 'btn-primary'}`}
        title={err ?? undefined}
      >
        {claimedByMe ? <LockOpen size={13} /> : <Hand size={13} />}
        {pending ? '…' : claimedByMe ? 'Libérer' : 'Je prends'}
      </button>
      {err && <span style={{ fontSize: 10, color: 'var(--danger)' }}>{err}</span>}
    </>
  );
}
