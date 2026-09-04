'use client';

import { PhoneCall } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CallResultForm } from '@/components/closing/call-result-form';

/**
 * « Enregistrer un appel » sur la fiche : le même formulaire que le mode
 * appel — résultat, ce qui s'est dit, la suite pré-remplie, une note.
 */
export function CallLogPanel({
  investorId,
  name,
  missedAttempts,
}: {
  investorId: string;
  name: string;
  missedAttempts: number;
}) {
  const router = useRouter();
  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PhoneCall size={15} />
          Enregistrer un appel
        </div>
      </div>
      <div className="view-card-body">
        <CallResultForm
          investorId={investorId}
          name={name}
          missedAttempts={missedAttempts}
          onSaved={() => router.refresh()}
        />
      </div>
    </div>
  );
}
