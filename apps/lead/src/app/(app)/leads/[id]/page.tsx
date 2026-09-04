import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LeadFiche } from '@/components/leads/lead-fiche';
import { getAuthenticatedUser } from '@/lib/auth';
import { getLeadDetail } from '@/lib/leads/queries';

export const dynamic = 'force-dynamic';

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await getAuthenticatedUser();
  const detail = await getLeadDetail(user, id);
  if (!detail) notFound();
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Link href="/a-rappeler" className="row hint" style={{ gap: 6 }}>
        <ArrowLeft size={14} /> À rappeler
      </Link>
      <LeadFiche detail={detail} user={user} variant="page" />
    </div>
  );
}
