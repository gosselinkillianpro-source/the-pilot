import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getInvestorById,
  getInvestorSubscriptions,
  type InvestorSubscription,
} from '@/lib/db/queries/investors';
import { getInvestorStage } from '@/lib/investor-stage';
import { InvestorEmailPanel } from './investor-email-panel';

type Props = { params: Promise<{ id: string }> };

function initials(first: string | null, last: string | null, fallback: string): string {
  const a = first?.[0] ?? fallback[0] ?? '?';
  const b = last?.[0] ?? '';
  return `${a}${b}`.toUpperCase();
}

function civilityLabel(c: string | null): string {
  if (!c) return '';
  const v = c.toLowerCase();
  if (v === 'mr' || v === 'm' || v.startsWith('mons')) return 'Monsieur';
  if (v === 'mrs' || v === 'ms' || v === 'mme' || v.startsWith('mad')) return 'Madame';
  return c;
}

function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function fmtDateTime(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtBirthdate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : fmtDate(d);
}

function fmtMoney(n: number): string {
  return `${n.toLocaleString('fr-FR')} €`;
}

function fullAddress(inv: {
  addressStreet: string | null;
  addressComplement: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  countryResidence: string | null;
}): string {
  const line = [inv.addressStreet, inv.addressComplement].filter(Boolean).join(', ');
  const cityLine = [inv.addressPostalCode, inv.addressCity].filter(Boolean).join(' ');
  const parts = [line, cityLine, inv.countryResidence].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

const SUB_STATUS: Record<string, { label: string; cls: string }> = {
  signed: { label: 'Signée', cls: 'badge badge-brand' },
  paid: { label: 'Payée', cls: 'badge badge-success' },
  active: { label: 'Active', cls: 'badge badge-success' },
  repaid: { label: 'Remboursée', cls: 'badge badge-success' },
  cancelled: { label: 'Annulée', cls: 'badge badge-neutral' },
};

export default async function InvestorPage({ params }: Props) {
  const { id } = await params;
  const investor = await getInvestorById(id);
  if (!investor) notFound();

  const subs = await getInvestorSubscriptions(investor.id);
  const firstName = investor.firstName ?? investor.fullName?.split(' ')[0] ?? 'Investisseur';
  const civ = civilityLabel(investor.civility);
  const displayName = [civ, investor.fullName].filter(Boolean).join(' ') || investor.email;

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
            {displayName}
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
            {(() => {
              const stage = getInvestorStage(investor);
              return <span className={stage.badgeClass}>{stage.label}</span>;
            })()}
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

          {/* Souscriptions */}
          <div className="view-card">
            <div className="view-card-header">
              <div className="view-card-title">Souscriptions</div>
              <span className="badge badge-neutral">{subs.rows.length}</span>
            </div>
            <div className="view-card-body" style={{ padding: 0 }}>
              {subs.rows.length === 0 ? (
                <div style={{ padding: '20px', fontSize: 13, color: 'var(--text-3)' }}>
                  Aucune souscription.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: 'flex',
                      gap: 24,
                      padding: '12px 20px',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <Stat label="Total investi" value={fmtMoney(subs.totalAmount)} />
                    <Stat label="Souscriptions actives" value={String(subs.activeCount)} />
                  </div>
                  {subs.rows.map((s: InvestorSubscription, idx) => {
                    const st = SUB_STATUS[s.status] ?? {
                      label: s.status,
                      cls: 'badge badge-neutral',
                    };
                    return (
                      <div
                        key={s.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1.6fr 1fr 0.8fr 110px',
                          gap: 12,
                          alignItems: 'center',
                          padding: '12px 20px',
                          borderBottom:
                            idx < subs.rows.length - 1 ? '1px solid var(--border)' : 'none',
                        }}
                      >
                        <span style={{ fontSize: 13, color: 'var(--text-1)', minWidth: 0 }}>
                          {s.projectName}
                          {s.projectCity ? (
                            <span style={{ color: 'var(--text-4)' }}> · {s.projectCity}</span>
                          ) : null}
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}>
                          {fmtMoney(Number(s.amount) || 0)}
                          {s.sharesCount ? (
                            <span style={{ color: 'var(--text-4)', fontWeight: 400, fontSize: 11 }}>
                              {' '}
                              ({s.sharesCount} parts)
                            </span>
                          ) : null}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {fmtDate(s.signedAt ?? s.paidAt)}
                        </span>
                        <span style={{ textAlign: 'right' }}>
                          <span className={st.cls}>{st.label}</span>
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Identité */}
          <Card title="Identité">
            <Row label="Civilité" value={civ || '—'} />
            <Row label="Date de naissance" value={fmtBirthdate(investor.dateOfBirth)} />
            <Row label="Nationalité" value={investor.nationality ?? '—'} />
          </Card>

          {/* Coordonnées */}
          <Card title="Coordonnées">
            <Row label="Email" value={investor.email} />
            <Row label="Téléphone" value={investor.phone ?? '—'} />
            <Row label="Adresse" value={fullAddress(investor)} />
            <Row label="Résidence fiscale" value={investor.taxResidencyCountry ?? '—'} />
          </Card>

          {/* Apporteur d'affaires */}
          <Card title="Apporteur">
            <Row label="Code bonus" value={investor.bonusCode ?? '—'} />
            <Row label="CGP" value={investor.cgpName ?? '—'} />
            <Row label="Réseau CGP" value={investor.cgpNetwork ?? '—'} />
          </Card>

          {/* Lemonway / Onboarding */}
          <Card title="Lemonway / Onboarding">
            <Row
              label="Profil complété"
              value={investor.registrationComplete ? '✅ oui' : '❌ non'}
            />
            <Row
              label="Onboarding (KYC)"
              value={investor.onboardingComplete ? '✅ validé' : '❌ Non'}
            />
            <Row label="Statut onboarding" value={investor.lwOnboardingStatus ?? '—'} />
            <Row label="ID Lemonway" value={investor.lwOnboardingId ?? '—'} />
            <Row label="Compte Lemonway" value={investor.lemonwayAccountId ?? '—'} />
            <Row
              label="Solde portefeuille"
              value={
                investor.walletBalanceCents != null
                  ? fmtMoney(Math.round(investor.walletBalanceCents / 100))
                  : '—'
              }
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
              Données miroir lecture seule depuis Seven At Home. IBAN/BIC jamais stockés.
            </p>
          </Card>

          {/* Dates */}
          <Card title="Dates (SAH)">
            <Row label="Créé le" value={fmtDateTime(investor.sahCreatedAt)} />
            <Row label="Modifié le" value={fmtDateTime(investor.sahUpdatedAt)} />
          </Card>
        </aside>
      </div>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title">{title}</div>
      </div>
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 500, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontSize: 16, color: 'var(--text-1)', fontWeight: 700 }}>{value}</span>
    </div>
  );
}
