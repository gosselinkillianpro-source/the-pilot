import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getEmailConfig } from '@/lib/email/config';
import { getBrevoLists } from '@/lib/integrations/brevo/client';
import { ComposeForm } from './compose-form';

export const dynamic = 'force-dynamic';

export default async function ComposePage() {
  const config = getEmailConfig();
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
          Scan AMF automatique · expéditeur {config.senderName} &lt;{config.senderAddress}&gt;
        </div>
      </div>

      <ComposeForm lists={lists} testMode={config.testMode} testAddress={config.testAddress} />
    </>
  );
}
