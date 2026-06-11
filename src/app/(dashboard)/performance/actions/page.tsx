import {
  ArrowRight,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { PerformanceTabs } from '@/components/shared/performance-tabs';
import {
  type ActionKind,
  actionConversionRate,
  mockActionRoi,
  mockAttributedJourneys,
  mockAttributionSummary,
  revenuePerAction,
} from '@/lib/mock-data';

const ACTION_ICON: Record<ActionKind, typeof Phone> = {
  call: Phone,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  email_manual: Mail,
  email_auto: Mail,
};

const STEP_COLOR: Record<string, string> = {
  call: 'var(--brand)',
  sms: 'var(--warning)',
  whatsapp: 'var(--success)',
  email_manual: 'var(--text-3)',
  email_auto: 'var(--ai)',
  behavior: 'var(--text-4)',
  investment: 'var(--success)',
};

function eur(n: number): string {
  return n.toLocaleString('fr-FR');
}

export default function ActionsRoiPage() {
  // Action la plus rentable par € généré par action
  const bestByPerAction = [...mockActionRoi].sort(
    (a, b) => revenuePerAction(b) - revenuePerAction(a),
  )[0];
  const callRoi = mockActionRoi.find((a) => a.kind === 'call');

  // Garde de sûreté (données mock toujours présentes)
  if (!bestByPerAction || !callRoi) return null;

  return (
    <>
      <div>
        <h1 className="page-title">Performance Lab</h1>
        <div className="page-desc">
          Quelle action génère quel retour. Attribution : {mockAttributionSummary.attributionModel}.
        </div>
        <PerformanceTabs active="/performance/actions" />
      </div>

      {/* Avertissement honnêteté : cette page n'est PAS encore branchée sur les vraies données. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          borderRadius: 12,
          background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)',
          color: 'var(--text-1)',
          fontSize: 13,
        }}
      >
        <Sparkles size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
        <span>
          <strong>Données de démonstration.</strong> Cette page illustre le futur « ROI par action »
          — les chiffres ci-dessous sont fictifs. Le branchement sur tes vraies données
          d'attribution (déjà calculées dans le module Closing) arrive bientôt.
        </span>
      </div>

      {/* KPIs résumé */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div className="kpi-hero">
          <div className="kpi-hero-label">€ attribués ce mois</div>
          <div className="kpi-hero-value">
            963<span className="kpi-hero-value-currency">K€</span>
          </div>
          <div className="kpi-hero-trend">
            <span className="kpi-hero-trend-arrow up">
              <TrendingUp size={10} />
              {mockAttributionSummary.totalConversions} investissements
            </span>
          </div>
        </div>
        <div className="kpi-hero">
          <div className="kpi-hero-label">Action la + rentable</div>
          <div className="kpi-hero-value" style={{ fontSize: '1.5rem' }}>
            {bestByPerAction.label.split(' ')[0]}
          </div>
          <div className="kpi-hero-trend">
            <span>{eur(revenuePerAction(bestByPerAction))}€ / action</span>
          </div>
        </div>
        <div className="kpi-hero">
          <div className="kpi-hero-label">Délai moyen action → invest.</div>
          <div className="kpi-hero-value">
            {mockAttributionSummary.avgDelayDays}
            <span className="kpi-hero-value-currency">jours</span>
          </div>
          <div className="kpi-hero-trend">
            <span>du 1er contact au virement</span>
          </div>
        </div>
        <div className="kpi-hero">
          <div className="kpi-hero-label">Actions réalisées</div>
          <div className="kpi-hero-value">{eur(mockAttributionSummary.totalActions)}</div>
          <div className="kpi-hero-trend">
            <span>tous canaux confondus</span>
          </div>
        </div>
      </div>

      {/* Tableau ROI par action */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">ROI par type d'action · ce mois</div>
          <span className="badge badge-ai badge-dot">Attribution multi-touch</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {/* En-tête colonnes */}
          <div
            className="r-stack r-head"
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 0.8fr 0.8fr 1fr 1.2fr 0.9fr',
              gap: 12,
              padding: '10px 20px',
              borderBottom: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-4)',
            }}
          >
            <span>Action</span>
            <span style={{ textAlign: 'right' }}>Réalisées</span>
            <span style={{ textAlign: 'right' }}>Conv.</span>
            <span style={{ textAlign: 'right' }}>Taux</span>
            <span style={{ textAlign: 'right' }}>€ générés</span>
            <span style={{ textAlign: 'right' }}>€/action</span>
          </div>

          {mockActionRoi.map((a, idx) => {
            const Icon = ACTION_ICON[a.kind];
            const perAction = revenuePerAction(a);
            const isBest = a.kind === bestByPerAction.kind;
            return (
              <div
                key={a.kind}
                className="r-stack"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 0.8fr 0.8fr 1fr 1.2fr 0.9fr',
                  gap: 12,
                  alignItems: 'center',
                  padding: '14px 20px',
                  borderBottom: idx < mockActionRoi.length - 1 ? '1px solid var(--border)' : 'none',
                  background: isBest ? 'var(--success-bg)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: 'var(--surface-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: STEP_COLOR[a.kind],
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={15} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>
                    {a.label}
                  </span>
                </div>
                <span
                  style={{
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--text-2)',
                  }}
                >
                  {eur(a.count)}
                </span>
                <span
                  style={{
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--text-2)',
                  }}
                >
                  {a.conversions}
                </span>
                <span
                  style={{
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--text-1)',
                    fontWeight: 600,
                  }}
                >
                  {actionConversionRate(a)}
                </span>
                <span
                  style={{
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--text-1)',
                  }}
                >
                  {eur(a.revenueGenerated)}€
                </span>
                <span
                  style={{
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    fontWeight: 700,
                    color: isBest ? 'var(--success)' : 'var(--text-1)',
                  }}
                >
                  {eur(perAction)}€
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="alert alert-ai">
        <span className="alert-icon">
          <Sparkles size={16} />
        </span>
        <div className="alert-body">
          <div className="alert-title">Lecture IA</div>
          <div className="alert-description">
            L'appel reste l'action qui rapporte le plus <strong>par action</strong> (
            {eur(revenuePerAction(callRoi))}€), mais le SMS a le meilleur rapport coût/efficacité
            (471€/SMS pour un coût quasi nul). Recommandation : combiner appel sur les hot leads +
            SMS en relance systématique.
          </div>
        </div>
      </div>

      {/* Exemples de parcours attribués */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Exemples de parcours attribués</div>
          <span className="badge badge-neutral">Comment on lit l'attribution</span>
        </div>
        <div
          className="view-card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
        >
          {mockAttributedJourneys.map((j) => (
            <div key={j.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                  {j.investorName}
                </span>
                <span className="badge badge-success">
                  {eur(j.amount)}€ · {j.project}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
                {j.steps.map((step, i) => (
                  <div
                    key={`${j.id}-${step.day}-${step.kind}`}
                    style={{ display: 'flex', alignItems: 'center' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background:
                          step.kind === 'investment'
                            ? 'var(--success-bg)'
                            : step.kind === 'behavior'
                              ? 'var(--surface-2)'
                              : 'var(--glass-bg-strong)',
                        border: `1px solid ${step.kind === 'investment' ? 'rgba(5,150,105,0.2)' : 'var(--border)'}`,
                        minWidth: 110,
                        textAlign: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          color: 'var(--text-4)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {step.day}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color:
                            step.kind === 'investment' ? 'var(--success-text)' : 'var(--text-2)',
                          fontWeight: step.kind === 'investment' ? 600 : 400,
                          lineHeight: 1.3,
                        }}
                      >
                        {step.action}
                      </span>
                    </div>
                    {i < j.steps.length - 1 && (
                      <ArrowRight
                        size={14}
                        style={{ color: 'var(--text-4)', margin: '0 4px', flexShrink: 0 }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p style={{ fontSize: 11, color: 'var(--text-4)', fontStyle: 'italic', lineHeight: 1.5 }}>
            Chaque investissement est relié aux actions qui l'ont précédé dans la fenêtre
            d'attribution (30 jours). Le mérite est réparti entre ces actions (modèle multi-touch).
            C'est ce qui alimente le tableau ci-dessus.
          </p>
        </div>
      </div>
    </>
  );
}
