import { RotateCw } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth';
import { getDormantCandidates, getReboundCandidates } from '@/lib/closing/relances';
import { getEmailConfig } from '@/lib/email/config';
import { RelancesClient } from './relances-client';

export const dynamic = 'force-dynamic';

export default async function RelancesPage() {
  // Réservé à l'admin (Killian) : c'est lui seul qui valide les envois.
  const user = await getAuthenticatedUser();
  if (user.role !== 'admin') notFound();

  const [rebound, dormant] = await Promise.all([getReboundCandidates(), getDormantCandidates()]);
  const testMode = getEmailConfig().testMode;

  return (
    <>
      <div>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RotateCw size={20} />
          Relances — rebond & endormis
        </h1>
        <div className="page-desc">
          Récupération de CA : réinvestissement avant remboursement + réveil des onboardés jamais
          investis. Le Pilote rédige (scan AMF), <strong>tu relis et approuves</strong> — rien ne
          part automatiquement.
        </div>
      </div>

      <RelancesClient rebound={rebound} dormant={dormant} testMode={testMode} />
    </>
  );
}
