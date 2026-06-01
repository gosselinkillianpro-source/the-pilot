import { AlertTriangle, ArrowLeft, Mail } from 'lucide-react';
import Link from 'next/link';
import {
  getBrevoTransactional,
  getSentEmails,
  type SentEmailStatus,
} from '@/lib/integrations/brevo/client';

export const dynamic = 'force-dynamic';

function nb(n: number): string {
  return n.toLocaleString('fr-FR');
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_META: Record<SentEmailStatus, { label: string; cls: string }> = {
  sent: { label: 'Envoyé', cls: 'badge-neutral' },
  delivered: { label: 'Délivré', cls: 'badge-neutral' },
  opened: { label: 'Ouvert', cls: 'badge-brand' },
  clicked: { label: 'Cliqué', cls: 'badge-success badge-dot' },
  bounced: { label: 'Rejeté', cls: 'badge-warning' },
  spam: { label: 'Spam', cls: 'badge-danger' },
  blocked: { label: 'Bloqué', cls: 'badge-danger' },
};

export default async function SentEmailsPage() {
  let emails: Awaited<ReturnType<typeof getSentEmails>> = [];
  let tx: Awaited<ReturnType<typeof getBrevoTransactional>>;

  try {
    [emails, tx] = await Promise.all([getSentEmails(100), getBrevoTransactional()]);
  } catch (e) {
    return (
      <>
        <BackLink />
        <div className="alert alert-danger">
          <span className="alert-icon">
            <AlertTriangle size={16} />
          </span>
          <div className="alert-body">
            <div className="alert-title">Impossible de charger la boîte d'envoi</div>
            <div className="alert-description">
              {e instanceof Error ? e.message : 'Erreur inconnue'}.
            </div>
          </div>
        </div>
      </>
    );
  }

  const txOpenRate = tx.delivered > 0 ? Math.round((tx.opens / tx.delivered) * 1000) / 10 : 0;
  const txClickRate = tx.delivered > 0 ? Math.round((tx.clicks / tx.delivered) * 1000) / 10 : 0;

  return (
    <>
      <BackLink />
      <div>
        <h1 className="page-title">Boîte d'envoi</h1>
        <div className="page-desc">
          Tes emails transactionnels envoyés, avec leur statut. En direct de Brevo.
        </div>
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}
        className="view-card"
      >
        <Stat label="Envoyés (cumul)" value={nb(tx.requests)} />
        <Stat label="Délivrés" value={nb(tx.delivered)} />
        <Stat label="Ouvertures" value={`${nb(tx.opens)} · ${txOpenRate}%`} />
        <Stat label="Clics" value={`${nb(tx.clicks)} · ${txClickRate}%`} />
      </div>

      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Derniers envois</div>
          <span className="badge badge-neutral">{emails.length} affichés</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '110px 1fr 1.4fr 90px',
              gap: 12,
              padding: '10px 20px',
              borderBottom: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-4)',
            }}
          >
            <span>Date</span>
            <span>Destinataire</span>
            <span>Objet</span>
            <span style={{ textAlign: 'right' }}>Statut</span>
          </div>

          {emails.length === 0 ? (
            <div style={{ padding: '24px 20px', fontSize: 13, color: 'var(--text-3)' }}>
              Aucun email transactionnel envoyé pour l'instant.
            </div>
          ) : (
            emails.map((m, idx) => {
              const meta = STATUS_META[m.status];
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '110px 1fr 1.4fr 90px',
                    gap: 12,
                    alignItems: 'center',
                    padding: '12px 20px',
                    borderBottom: idx < emails.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <span
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}
                  >
                    {formatDate(m.date)}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--text-2)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m.to}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: 'var(--text-1)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m.subject}
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span className={`badge ${meta.cls}`}>{meta.label}</span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="alert alert-info">
        <span className="alert-icon">
          <Mail size={16} />
        </span>
        <div className="alert-body">
          <div className="alert-title">Statut en quasi temps réel</div>
          <div className="alert-description">
            Les statuts viennent des événements Brevo (rafraîchis toutes les 2 min). Le webhook
            temps réel (à venir) rendra ça instantané et alimentera le scoring IA.
          </div>
        </div>
      </div>
    </>
  );
}

function BackLink() {
  return (
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
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-4)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{value}</div>
    </div>
  );
}
