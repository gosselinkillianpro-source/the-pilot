import { ArrowLeft, Mail, Phone, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getInitials, mockInvestors, mockInvestorTimeline, STAGE_LABELS } from '@/lib/mock-data';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function InvestorPage({ params }: Props) {
  const { id } = await params;
  const investor = mockInvestors.find((i) => i.id === id);
  if (!investor) notFound();

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
        Retour au pipeline
      </Link>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
          marginBottom: 8,
        }}
      >
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
            boxShadow: '0 8px 24px rgba(124, 58, 237, 0.28), inset 0 1px 0 rgba(255,255,255,0.2)',
            flexShrink: 0,
          }}
        >
          {getInitials(investor.firstName, investor.lastName)}
        </div>

        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ fontSize: '1.5rem', marginBottom: 4 }}>
            {investor.firstName} {investor.lastName}
          </h1>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text-3)',
              marginBottom: 8,
            }}
          >
            {investor.id.toUpperCase()} · {investor.email}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="badge badge-brand">{STAGE_LABELS[investor.stage]}</span>
            <span className="badge badge-neutral">{investor.segment}</span>
            <span className="badge badge-neutral">
              {investor.acquisitionSource.replace('_', ' ')}
            </span>
            {investor.onboardingComplete && (
              <span className="badge badge-success badge-dot">Onboardé</span>
            )}
            {!investor.onboardingComplete && investor.registrationComplete && (
              <span className="badge badge-warning badge-dot">Onboarding en cours</span>
            )}
          </div>
        </div>

        <div
          style={{
            textAlign: 'right',
            padding: '12px 16px',
            background: 'var(--glass-bg-strong)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
            border: '1px solid var(--glass-border)',
            borderRadius: 12,
            boxShadow:
              investor.score >= 80
                ? 'var(--shadow-glass-sm), 0 0 32px rgba(16, 185, 129, 0.12)'
                : 'var(--shadow-glass-sm)',
            minWidth: 140,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: 2,
            }}
          >
            Score IA
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: '1.875rem',
              color:
                investor.score >= 80
                  ? 'var(--success)'
                  : investor.score >= 60
                    ? 'var(--warning)'
                    : 'var(--text-3)',
              lineHeight: 1,
            }}
          >
            {investor.score}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ai-brief">
            <div className="ai-brief-header">
              <span className="ai-brief-label">Brief IA · prêt à appeler</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--text-3)',
                }}
              >
                généré il y a 4 min · 1 247 tokens · 0.018€
              </span>
            </div>
            <div className="ai-brief-script">
              « Bonjour {investor.firstName}, j'ai vu que vous avez simulé un investissement de{' '}
              {investor.amountMentioned ? `${investor.amountMentioned}€` : '15 000€'} sur Brézins.
              Je vous appelle pour répondre à vos questions et voir si ce projet correspond à votre
              stratégie. »
            </div>
            <div className="ai-brief-points">
              <div className="ai-brief-point">
                <span className="ai-brief-point-num">1</span>
                <span>
                  <strong>Signal fort</strong> : 4 ouvertures email + 2 clics sur Brézins en 48h.
                  Engagement actif sur la dernière semaine.
                </span>
              </div>
              <div className="ai-brief-point">
                <span className="ai-brief-point-num">2</span>
                <span>
                  <strong>Projets à proposer</strong> : Brézins (12 mois, 15% cible) en priorité ;
                  Capsule (18 mois) en alternative si durée plus longue acceptable.
                </span>
              </div>
              <div className="ai-brief-point">
                <span className="ai-brief-point-num">3</span>
                <span>
                  <strong>Objections probables</strong> : "Pourquoi club deal et pas SCPI ?" →
                  rappeler durée courte + rendement cible 15% (avec mention "capital non garanti").
                </span>
              </div>
              <div className="ai-brief-point">
                <span className="ai-brief-point-num">4</span>
                <span>
                  <strong>Ton</strong> : direct, factuel, sans pression commerciale. Vouvoiement
                  (pas d'historique de tutoiement).
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary">
              <Phone />
              Démarrer l'appel
            </button>
            <button type="button" className="btn btn-secondary">
              <Mail />
              Envoyer un email
            </button>
            <button type="button" className="btn btn-ai">
              <Sparkles />
              Régénérer le brief
            </button>
          </div>

          <div className="view-card">
            <div className="view-card-header">
              <div className="view-card-title">Historique</div>
              <span className="badge badge-neutral">{mockInvestorTimeline.length} événements</span>
            </div>
            <div className="view-card-body">
              <div className="timeline">
                {mockInvestorTimeline.map((event) => (
                  <div
                    key={event.id}
                    className={`timeline-event ${event.type !== 'default' ? event.type : ''}`}
                  >
                    <div className="timeline-event-time">{event.time}</div>
                    <div className="timeline-event-title">{event.title}</div>
                    <div className="timeline-event-desc">{event.description}</div>
                  </div>
                ))}
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
              <Row label="Segment" value={investor.segment} />
              <Row
                label="Total investi"
                value={
                  investor.totalInvested > 0
                    ? `${investor.totalInvested.toLocaleString('fr-FR')}€`
                    : '—'
                }
              />
              {investor.amountMentioned && (
                <Row
                  label="Montant évoqué"
                  value={`${investor.amountMentioned.toLocaleString('fr-FR')}€`}
                />
              )}
              <Row label="Source" value={investor.acquisitionSource.replace('_', ' ')} />
              <Row label="Dernière interaction" value={investor.lastInteractionAt} />
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
                label="Inscription"
                value={investor.registrationComplete ? '✅ complète' : '❌ en cours'}
              />
              <Row
                label="Onboarding (KYC)"
                value={investor.onboardingComplete ? '✅ validé' : '❌ pas terminé'}
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
                Le KYC reste géré côté SAH (cadre ACPR). On reçoit juste ces 2 booléens.
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
