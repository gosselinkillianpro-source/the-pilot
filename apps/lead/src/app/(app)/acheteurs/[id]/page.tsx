import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { InvitePanel, PackPanel, PausePanel } from '@/components/buyers/buyer-admin-panels';
import { BuyerForm } from '@/components/buyers/buyer-form';
import { PageHeader } from '@/components/ui/page-header';
import { getAuthenticatedUser } from '@/lib/auth';
import { getBuyer } from '@/lib/buyers/queries';
import { listSourcesForUser } from '@/lib/leads/queries';
import { updateBuyerAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function BuyerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthenticatedUser();
  if (user.role !== 'admin') redirect('/acheteurs');
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [found, sources] = await Promise.all([getBuyer(user, id), listSourcesForUser(user)]);
  if (!found) notFound();
  return (
    <>
      <Link href="/acheteurs" className="row hint" style={{ gap: 6, marginBottom: 12 }}>
        <ArrowLeft size={14} /> Acheteurs
      </Link>
      <PageHeader
        title={found.buyer.name}
        sub={`${found.sourceName} · ORIAS ${found.buyer.oriasNumber}`}
      />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <BuyerForm
          action={updateBuyerAction.bind(null, id)}
          sources={sources.map((s) => ({ id: s.id, name: s.name }))}
          buyer={found.buyer}
          submitLabel="Enregistrer"
        />
        <div className="stack" style={{ gap: 18 }}>
          <InvitePanel buyerId={id} users={found.users} />
          <PackPanel
            buyerId={id}
            packs={found.packs}
            defaultPriceCents={found.buyer.pricePerRdvCents}
          />
          <PausePanel buyerId={id} pausedUntil={found.buyer.pausedUntil} />
        </div>
      </div>
    </>
  );
}
