import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getEmailConfig } from '@/lib/email/config';
import { getBrevoLists } from '@/lib/integrations/brevo/client';
import { CampaignForm } from './campaign-form';

export const dynamic = 'force-dynamic';

export default async function NewCampaignPage() {
  const config = getEmailConfig();
  let lists: Awaited<ReturnType<typeof getBrevoLists>> = [];
  let error: string | null = null;
  try {
    lists = await getBrevoLists();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Erreur inconnue';
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
        <h1 className="page-title">Nouvelle campagne</h1>
        <div className="page-desc">
          Crée une campagne (brouillon) avec ton template de marque + scan AMF, sans ouvrir Brevo.
        </div>
      </div>

      {config.testMode && (
        <div className="alert alert-info">
          <span className="alert-icon">
            <AlertTriangle size={16} />
          </span>
          <div className="alert-body">
            <div className="alert-title">Mode test actif</div>
            <div className="alert-description">
              La campagne sera créée en <strong>brouillon</strong> dans Brevo. L'envoi réel à la
              liste est bloqué tant que le mode test est actif (garde-fou anti-erreur).
            </div>
          </div>
        </div>
      )}

      {error ? (
        <div className="alert alert-danger">
          <span className="alert-icon">
            <AlertTriangle size={16} />
          </span>
          <div className="alert-body">
            <div className="alert-title">Listes indisponibles</div>
            <div className="alert-description">{error}.</div>
          </div>
        </div>
      ) : (
        <CampaignForm
          testMode={config.testMode}
          lists={lists.map((l) => ({ id: l.id, name: l.name, subscribers: l.uniqueSubscribers }))}
        />
      )}
    </>
  );
}
