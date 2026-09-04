import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SourceForm } from '@/components/sources/source-form';
import { PageHeader } from '@/components/ui/page-header';
import { getAuthenticatedUser } from '@/lib/auth';
import { appUrl } from '@/lib/env';
import { listSourcesForUser } from '@/lib/leads/queries';

export const dynamic = 'force-dynamic';

export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthenticatedUser();
  if (user.role !== 'admin') redirect('/');
  const source = (await listSourcesForUser(user)).find((s) => s.id === id);
  if (!source) notFound();
  return (
    <>
      <Link href="/sources" className="row hint" style={{ gap: 6, marginBottom: 12 }}>
        <ArrowLeft size={14} /> Sources
      </Link>
      <PageHeader title={source.name} sub={`Code ${source.code}`} />
      <SourceForm source={source} appUrl={appUrl()} />
    </>
  );
}
