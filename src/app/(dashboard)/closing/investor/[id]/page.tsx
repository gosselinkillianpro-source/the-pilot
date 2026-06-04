import { ArrowLeft, Clock } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getInvestorById } from '@/lib/db/queries/investors';
import { InvestorEmailPanel } from './investor-email-panel';

type Props = { params: Promise<{ id: string }> };

function initials(first: string | null, last: string | null, fallback: string): string {
  const a = first?.[0] ?? fallback[0] ?? '?';
  const b = last?.[0] ?? '';
  return `${a}${b}`.toUpperCase();
}

export default async function InvestorPage({ params }: Props) {
  const { id } = await params;
  const investor = await getInvestorById(id);
  if (!investor) notFound();

  const firstName = investor.firstName ?? investor.fullName?.split(' ')[0] ?? 'Investisseur';

  return (
    <>
      <Link
        href="/closing/pipeline"
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
        Retour aux investisseurs
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 8 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 9999,
            background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 700,
            fontSize: '1.125rem',
            flexShrink: 0,
          }}
        >
          {initials(investor.firstName, investor.lastName, investor.email)}
        </div>

        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ fontSize: '1.5rem', marginBottom: 4 }}>
            {investor.fullName ?? investor.email}
          </h1>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text-3)',
              marginBottom: 8,
            }}
          >
            SAH #{investor.sahId} · {investor.email}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {investor.onboardingComplete ? (
              <span className="badge badge-success badge-dot">Onboardé (KYC validé)</span>
            ) : investor.registrationComplete ? (
              <span className="badge badge-brand">Profil complet</span>
            ) : (
              <span className="badge badge-neutral">Inscrit</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <InvestorEmailPanel
            investorId={investor.id}
            firstName={firstName}
            email={investor.email}
          />

          <div className="alert alert-info">
            <span className="alert-icon">
              <Clock size={16} />
            </span>
            <div className="alert-body">
              <div className="alert-title">Scoring & historique : bientôt</div>
              <div className="alert-description">
                Le score de priorisation et la timeline d'interactions arriveront avec la
                synchronisation des souscriptions et le tracking des actions.
              </div>
            </div>
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="view-card">
            <div className="view-card-header">
              <div className="view-card-title">Profil</div>
            </div>
            <div
              className="view-card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <Row label="Téléphone" value={investor.phone ?? '—'} />
              <Row label="Ville" value={investor.addressCity ?? '—'} />
              <Row label="Code postal" value={investor.addressPostalCode ?? '—'} />
              <Row label="Date de naissance" value={investor.dateOfBirth ?? '—'} />
              <Row
                label="Total investi"
                value={
                  investor.totalInvested && Number(investor.totalInvested) > 0
                    ? `${Number(investor.totalInvested).toLocaleString('fr-FR')}€`
                    : '—'
                }
              />
            </div>
          </div>

          <div className="view-card">
            <div className="view-card-header">
              <div className="view-card-title">Statut SAH</div>
            </div>
            <div
              className="view-card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <Row
                label="Profil complet"
                value={investor.registrationComplete ? '✅ oui' : '❌ non'}
              />
              <Row
                label="Onboarding (KYC)"
                value={investor.onboardingComplete ? '✅ validé' : '❌ non'}
              />
              <p
                style={{
                  fontSize: 11,
                  color: 'var(--text-4)',
                  lineHeight: 1.5,
                  marginTop: 4,
                  fontStyle: 'italic',
                }}
              >
                Données miroir lecture seule depuis Seven At Home. Le KYC détaillé reste chez SAH.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 500, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}
