import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { PrefsForm, ScopeForm } from '@/components/users/user-forms';
import { getAuthenticatedUser } from '@/lib/auth';
import { listSourcesForUser } from '@/lib/leads/queries';
import { getUserRow } from '@/lib/users/queries';

export const dynamic = 'force-dynamic';

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthenticatedUser();
  if (user.role !== 'admin') redirect('/utilisateurs/moi');
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [row, sources] = await Promise.all([getUserRow(user, id), listSourcesForUser(user)]);
  if (!row) notFound();
  return (
    <>
      <Link href="/utilisateurs" className="row hint" style={{ gap: 6, marginBottom: 12 }}>
        <ArrowLeft size={14} /> Utilisateurs
      </Link>
      <PageHeader title={row.name ?? row.email} sub={row.email} />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <ScopeForm user={row} sources={sources.map((s) => ({ id: s.id, name: s.name }))} />
        <PrefsForm user={row} />
      </div>
    </>
  );
}
