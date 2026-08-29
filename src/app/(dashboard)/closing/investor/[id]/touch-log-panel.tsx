'use client';

import { Mail, MessageCircle, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import { logTouchAction } from './actions';

type TouchKind = 'email_sent' | 'sms_sent' | 'whatsapp_sent';

const KINDS: { value: TouchKind; label: string; done: string; icon: React.ReactNode }[] = [
  { value: 'email_sent', label: 'Mail envoyé', done: 'Mail tracé', icon: <Mail size={13} /> },
  { value: 'sms_sent', label: 'SMS envoyé', done: 'SMS tracé', icon: <MessageSquare size={13} /> },
  {
    value: 'whatsapp_sent',
    label: 'WhatsApp envoyé',
    done: 'WhatsApp tracé',
    icon: <MessageCircle size={13} />,
  },
];

/**
 * « Je viens d'envoyer un mail / SMS / WhatsApp » — un clic, c'est tracé.
 *
 * Le geste typique : au téléphone, l'investisseur demande un mail récapitulatif.
 * Le closer l'envoie depuis sa boîte, puis clique ici — l'envoi est horodaté
 * dans l'historique, et on pourra voir si la personne bouge ensuite.
 */
export function TouchLogPanel({ investorId }: { investorId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');

  function log(kind: TouchKind) {
    startTransition(async () => {
      const res = await logTouchAction({ investorId, kind, note: note.trim() || undefined });
      if (res.ok) {
        const def = KINDS.find((k) => k.value === kind);
        toast(`${def?.done ?? 'Envoi tracé'} — visible dans l'historique.`, {
          variant: 'success',
        });
        setNote('');
        router.refresh();
      } else {
        toast(res.message, { variant: 'error' });
      }
    });
  }

  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Mail size={15} />
          Tracer un envoi
        </div>
      </div>
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>
          Tu viens d'envoyer quelque chose à cette personne (depuis ta boîte, ton téléphone…) ?
          Trace-le ici : l'envoi est horodaté et ses suites deviennent visibles.
        </div>
        <input
          className="input"
          placeholder="Note (ex. « récap projets + DIC comme demandé à l'appel »)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => log(k.value)}
              disabled={pending}
            >
              {k.icon}
              {k.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
