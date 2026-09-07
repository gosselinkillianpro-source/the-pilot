'use client';

import { Shuffle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import { setAcceptsNewLeadsAction } from './actions';

/**
 * « Reçoit les nouveaux leads pubs » : entrer ou sortir un closer de la
 * rotation (vacances, Calendly seulement…). Admin seulement.
 */
export function LeadRotationToggle({
  userId,
  name,
  enabled,
  freshLeads,
}: {
  userId: string;
  name: string;
  enabled: boolean;
  freshLeads: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const res = await setAcceptsNewLeadsAction({ userId, enabled: !enabled });
      if (!res.ok) {
        toast(res.message, { variant: 'error' });
        return;
      }
      toast(
        res.enabled
          ? `${name} reçoit maintenant les nouveaux leads pubs (à tour de rôle).`
          : `${name} ne reçoit plus de nouveaux leads pubs. Ses clients lui restent.`,
        { variant: 'success', duration: 5000 },
      );
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
      <span
        style={{
          fontSize: 10,
          color: 'var(--text-4)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <Shuffle size={11} />
        Nouveaux leads pubs
        {enabled && freshLeads > 0 ? (
          <span
            className="badge badge-warning"
            style={{ fontSize: 9 }}
            title="Leads répartis pas encore touchés (72 h pour agir)"
          >
            {freshLeads} à appeler
          </span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        className={`btn btn-sm ${enabled ? 'btn-primary' : 'btn-secondary'}`}
        onClick={toggle}
        disabled={pending}
        title={
          enabled
            ? 'Dans la rotation : reçoit les nouveaux inscrits pubs à tour de rôle'
            : 'Hors rotation : ne reçoit aucun nouveau lead pub'
        }
      >
        {pending ? '…' : enabled ? 'Dans la rotation' : 'Hors rotation'}
      </button>
    </div>
  );
}
