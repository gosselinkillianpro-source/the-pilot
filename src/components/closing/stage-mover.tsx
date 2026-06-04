'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { updateStageAction } from '@/app/(dashboard)/closing/investor/[id]/actions';

const STAGES = [
  { value: 'new', label: 'Nouveau' },
  { value: 'contacted', label: 'Contacté' },
  { value: 'meeting_booked', label: 'RDV pris' },
  { value: 'meeting_done', label: 'RDV fait' },
  { value: 'proposal_sent', label: 'Proposition' },
  { value: 'closed_won', label: 'Gagné' },
  { value: 'closed_lost', label: 'Perdu' },
  { value: 'dormant', label: 'En sommeil' },
];

export function StageMover({ investorId, current }: { investorId: string; current: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      className="input"
      defaultValue={current}
      disabled={pending}
      style={{ fontSize: 11, padding: '3px 6px', height: 'auto' }}
      onChange={(e) => {
        const stage = e.target.value;
        if (stage === current) return;
        startTransition(async () => {
          await updateStageAction({ investorId, stage });
          router.refresh();
        });
      }}
    >
      {STAGES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
