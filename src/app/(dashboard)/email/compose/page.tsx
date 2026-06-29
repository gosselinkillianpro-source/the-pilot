import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getAuthenticatedUser } from '@/lib/auth';
import { getEmailConfig, pickSenderForUser } from '@/lib/email/config';
import { listSenders } from '@/lib/email/senders';
import { getBrevoLists } from '@/lib/integrations/brevo/client';
import { ComposeForm } from './compose-form';

export const dynamic = 'force-dynamic';

export default async function ComposePage() {
  const config = getEmailConfig();
  const [user, senders] = await Promise.all([getAuthenticatedUser(), listSenders()]);
  // Calage auto : expéditeur du closer pré-sélectionné (Yannick→Yannick, Cédric→Cédric).
  const defaultSender =
    pickSenderForUser(senders, user.email)?.address ?? senders[0]?.address ?? '';
  let lists: { id: number; name: string; uniqueSubscribers: number }[] = [];
  try {
    lists = (await getBrevoLists()).map((l) => ({
      id: l.id,
      name: l.name,
      uniqueSubscribers: l.uniqueSubscribers,
    }));
  } catch {
    lists = [];
  }

  return (
    <>
      <Link
        href="/email"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--text-3)',
          marginBottom: 4,
        }}
      >
        <ArrowLeft size={14} />
        Retour à Email
      </Link>
      <div>
        <h1 className="page-title">Composer un email</h1>
        <div className="page-desc">
          Scan AMF automatique ·{' '}
          {senders.length > 1
            ? `${senders.length} expéditeurs disponibles`
            : `expéditeur ${config.senderName} <${config.senderAddress}>`}
        </div>
      </div>

      <ComposeForm
        lists={lists}
        testMode={config.testMode}
        testAddress={config.testAddress}
        senders={senders}
        defaultSender={defaultSender}
      />
    </>
  );
}
