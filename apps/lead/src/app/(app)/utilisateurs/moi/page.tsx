import { PageHeader } from '@/components/ui/page-header';
import { PrefsForm } from '@/components/users/user-forms';
import { getAuthenticatedUser } from '@/lib/auth';
import { getUserRow } from '@/lib/users/queries';

export const dynamic = 'force-dynamic';

export default async function MePage() {
  const user = await getAuthenticatedUser();
  const row = await getUserRow(user, user.id);
  if (!row) return <p className="error">Compte introuvable (mode dev sans base ?).</p>;
  return (
    <>
      <PageHeader title="Mes alertes" sub="Où et quand recevoir les nouveaux leads." />
      <div style={{ maxWidth: 560 }}>
        <PrefsForm user={row} />
      </div>
    </>
  );
}
