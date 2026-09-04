import { redirect } from 'next/navigation';
import { BuyerForm } from '@/components/buyers/buyer-form';
import { PageHeader } from '@/components/ui/page-header';
import { getAuthenticatedUser } from '@/lib/auth';
import { listSourcesForUser } from '@/lib/leads/queries';
import { createBuyerAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewBuyerPage() {
  const user = await getAuthenticatedUser();
  if (user.role !== 'admin') redirect('/acheteurs');
  const sources = await listSourcesForUser(user);
  return (
    <>
      <PageHeader
        title="Nouvel acheteur"
        sub="Un acheteur appartient à une source. Ses critères décident du routage."
      />
      <BuyerForm
        action={createBuyerAction}
        sources={sources.map((s) => ({ id: s.id, name: s.name }))}
        submitLabel="Créer l’acheteur"
      />
    </>
  );
}
