import { ArrowLeft, Mail, MapPin, MessageCircle, MessageSquare, Phone } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CopyButton } from '@/components/affiliate/copy-button';
import { NotLinked } from '@/components/affiliate/ui';
import { getAffiliateInvestorDetail, resolveAffiliateScope } from '@/lib/db/queries/affiliate';
import { getInvestorStage } from '@/lib/investor-stage';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

const TIMELINE_LABEL: Record<string, string> = {
  call_outbound: 'Appel sortant',
  call_inbound: 'Appel entrant',
  email_sent: 'Email envoyé',
  email_opened: 'Email ouvert',
  email_clicked: 'Email cliqué',
  note_added: 'Note',
  meeting_booked: 'RDV pris',
  meeting_done: 'RDV fait',
  proposal_sent: 'Proposition envoyée',
};
const OUTCOME_LABEL: Record<string, string> = {
  reached: 'Joint',
  no_answer: 'Pas de réponse',
  voicemail: 'Répondeur',
  wrong_number: 'Mauvais numéro',
  callback_scheduled: 'Rappel programmé',
};
const STAGE_LABEL: Record<string, string> = {
  new: 'Nouveau',
  contacted: 'Contacté',
  meeting_booked: 'RDV pris',
  meeting_done: 'RDV fait',
  proposal_sent: 'Proposition',
  closed_won: 'Gagné',
  closed_lost: 'Perdu',
  dormant: 'En sommeil',
};
const SUB_STATUS: Record<string, { label: string; cls: string }> = {
  signed: { label: 'Signée', cls: 'badge badge-brand' },
  paid: { label: 'Payée', cls: 'badge badge-success' },
  active: { label: 'Active', cls: 'badge badge-success' },
  repaid: { label: 'Remboursée', cls: 'badge badge-success' },
  cancelled: { label: 'Annulée', cls: 'badge badge-neutral' },
};

const TEMP_COLOR: Record<string, string> = {
  hot: 'var(--danger, #c0392b)',
  warm: 'var(--warning, #d97706)',
  cold: 'var(--text-3)',
};

function tempClass(t: string): string {
  if (t === 'hot') return 'badge badge-danger';
  if (t === 'warm') return 'badge badge-warning';
  return 'badge badge-neutral';
}
function initials(first: string | null, last: string | null, fallback: string): string {
  const a = first?.[0] ?? fallback[0] ?? '?';
  const b = last?.[0] ?? '';
  return `${a}${b}`.toUpperCase();
}
function civilityLabel(c: string | null): string {
  if (!c) return '';
  const v = c.toLowerCase().trim();
  if (v === 'mrs' || v === 'ms' || v === 'mme' || v.startsWith('mad') || v.startsWith('miss'))
    return 'Madame';
  if (v === 'mr' || v === 'm' || v.startsWith('mons') || v.startsWith('mist')) return 'Monsieur';
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

export default async function FicheInvestisseurPage({ params, searchParams }: Props) {
  const scope = await resolveAffiliateScope();
  if (!scope) return <NotLinked title="Fiche investisseur" />;
  const { id } = await params;
  const { from } = await searchParams;
  const backHref = from?.startsWith('/reseau/') ? from : '/reseau/membres';

  // CONTRÔLE D'APPARTENANCE : null = hors réseau (ou inexistant) → 404, aucune fuite.
  const detail = await getAffiliateInvestorDetail(id, scope.sahId);
  if (!detail) notFound();

  const { investor, depth, scored, subs, timeline, callImpact } = detail;
  const civ = civilityLabel(investor.civility);
  const displayName = [civ, investor.fullName].filter(Boolean).join(' ') || investor.email;
  const sc = scored?.scored ?? null;
  // Numéro WhatsApp : chiffres seuls, 0 initial français → 33.
  const waNum = investor.phone ? investor.phone.replace(/\D/g, '').replace(/^0/, '33') : null;
  const repayDays = sc?.nearestRepaymentDays ?? null;
  const walletEuros =
    investor.walletBalanceCents != null ? Math.round(investor.walletBalanceCents / 100) : 0;
  // Résumé une ligne « qui est cette personne ».
  const summary: string[] = [];
  if (sc) summary.push(sc.statusLabel);
  if (subs.totalAmount > 0)
    summary.push(
      `${subs.totalAmount.toLocaleString('fr-FR')} € sur ${subs.activeCount} projet${subs.activeCount > 1 ? 's' : ''}`,
    );
  if (walletEuros >= 100) summary.push(`💰 ${walletEuros.toLocaleString('fr-FR')} € à placer`);
  if (callImpact?.lastCallAt) summary.push(`dernier appel le ${fmtDate(callImpact.lastCallAt)}`);
  // Blocage funnel (objectif d'appel clair).
  const funnelBlock = !investor.registrationComplete
    ? "Inscription non finalisée — objectif de l'appel : l'aider à terminer son inscription."
    : !investor.onboardingComplete
      ? "KYC non validé — objectif : débloquer la validation d'identité pour qu'il puisse investir."
      : null;

  return (
    <>
      <Link
        href={backHref}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--text-3)',
          marginBottom: 4,
        }}
      >
        <ArrowLeft size={14} /> Mon réseau
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
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px 16px',
              marginBottom: 8,
              fontSize: 12.5,
              color: 'var(--text-2)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Phone size={13} style={{ color: 'var(--text-4)' }} />
              {investor.phone ?? '—'}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Mail size={13} style={{ color: 'var(--text-4)' }} />
              {investor.email}
            </span>
            {fullAddress(investor) !== '—' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <MapPin size={13} style={{ color: 'var(--text-4)' }} />
                {fullAddress(investor)}
              </span>
            )}
          </div>
          {summary.length > 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 8 }}>
              {summary.join(' · ')}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(() => {
              const stage = getInvestorStage(investor);
              return <span className={stage.badgeClass}>{stage.label}</span>;
            })()}
            {depth != null && <span className="badge badge-ai">Réseau N+{depth}</span>}
            {repayDays != null && (
              <span
                className={`badge ${repayDays <= 14 ? 'badge-danger' : repayDays <= 30 ? 'badge-warning' : 'badge-neutral'}`}
                title="Jours avant le prochain remboursement (moment idéal pour réinvestir)"
              >
                Remboursement J-{repayDays}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {investor.phone ? (
              <a href={`tel:${investor.phone}`} className="btn btn-primary btn-sm">
                <Phone size={13} /> Appeler
              </a>
            ) : null}
            {investor.phone ? (
              <a href={`sms:${investor.phone}`} className="btn btn-secondary btn-sm">
                <MessageSquare size={13} /> SMS
              </a>
            ) : null}
            {waNum ? (
              <a
                href={`https://wa.me/${waNum}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
              >
                <MessageCircle size={13} /> WhatsApp
              </a>
            ) : null}
            <a href={`mailto:${investor.email}`} className="btn btn-secondary btn-sm">
              <Mail size={13} /> Email
            </a>
            {investor.phone ? <CopyButton value={investor.phone} label="n°" /> : null}
          </div>
        </div>
      </div>

      {funnelBlock && (
        <div className="alert alert-warning" style={{ marginBottom: 12 }}>
          <div className="alert-body">
            <div className="alert-title">À débloquer</div>
            <div className="alert-description">{funnelBlock}</div>
          </div>
        </div>
      )}

      {sc?.callGoal && (
        <div
          className="view-card"
          style={{
            marginBottom: 12,
            borderLeft: `3px solid ${TEMP_COLOR[sc.temperature] ?? 'var(--text-3)'}`,
          }}
        >
          <div
            className="view-card-body"
            style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
          >
            <span style={{ fontSize: 18 }}>👉</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-4)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Prochaine action
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-1)', fontWeight: 600 }}>
                {sc.callGoal}
              </div>
            </div>
            {investor.phone ? (
              <a href={`tel:${investor.phone}`} className="btn btn-primary btn-sm">
                <Phone size={13} /> Appeler
              </a>
            ) : null}
          </div>
        </div>
      )}

      <div className="split-2col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {scored && (
            <div className="view-card">
              <div className="view-card-header">
                <div className="view-card-title">Priorité d'appel</div>
                <span className={tempClass(scored.scored.temperature)}>
                  {scored.scored.temperatureLabel}
                </span>
              </div>
              <div
                className="view-card-body"
                style={{ display: 'flex', alignItems: 'center', gap: 20 }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1 }}
                  >
                    {scored.scored.priority}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-4)' }}>/ 100</div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                    {scored.scored.queueLabel}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {scored.scored.callGoal}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                    {scored.scored.factors.map((f) => (
                      <span key={f} className="badge badge-neutral" style={{ fontSize: 10 }}>
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
                {investor.phone ? (
                  <a href={`tel:${investor.phone}`} className="btn btn-primary btn-sm">
                    <Phone size={13} />
                    Appeler
                  </a>
                ) : null}
              </div>
            </div>
          )}

          {/* Historique */}
          <div className="view-card">
            <div className="view-card-header">
              <div className="view-card-title">Historique</div>
              <span className="badge badge-neutral">{timeline.length}</span>
            </div>
            <div className="view-card-body" style={{ padding: 0 }}>
              {timeline.length === 0 ? (
                <div style={{ padding: 20, fontSize: 13, color: 'var(--text-3)' }}>
                  Aucune interaction enregistrée pour l'instant.
                </div>
              ) : (
                timeline.map((t, idx) => (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 20px',
                      borderBottom: idx < timeline.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>
                        {TIMELINE_LABEL[t.type] ?? t.type}
                        {t.outcome ? (
                          <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>
                            {' '}
                            — {OUTCOME_LABEL[t.outcome] ?? t.outcome}
                          </span>
                        ) : null}
                      </span>
                      {t.note ? (
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                          {t.note}
                        </div>
                      ) : null}
                      {t.byName ? (
                        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
                          par {t.byName}
                        </div>
                      ) : null}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>
                      {new Date(t.createdAt).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Impact du dernier appel */}
          {callImpact && (
            <div className="view-card">
              <div className="view-card-header">
                <div className="view-card-title">Impact du dernier appel</div>
                {callImpact.outcome ? (
                  <span className="badge badge-neutral">
                    {OUTCOME_LABEL[callImpact.outcome] ?? callImpact.outcome}
                  </span>
                ) : (
                  <span className="badge badge-warning">à qualifier</span>
                )}
              </div>
              <div
                className="view-card-body"
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Appelé le {fmtDateTime(callImpact.lastCallAt)}
                </div>
                {callImpact.investedAfterAmount > 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
                    ✅ A investi {fmtMoney(callImpact.investedAfterAmount)} dans les 30 jours
                    suivant l'appel
                    {callImpact.investedAfterCount > 1
                      ? ` (${callImpact.investedAfterCount} souscriptions)`
                      : ''}{' '}
                    — appel rentable.
                  </div>
                ) : callImpact.stageProgressed ? (
                  <div style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
                    ✅ A progressé après l'appel :{' '}
                    {STAGE_LABEL[callImpact.stageAtCall ?? ''] ?? callImpact.stageAtCall} →{' '}
                    {STAGE_LABEL[callImpact.currentStage] ?? callImpact.currentStage} — appel utile.
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                    Pas encore d'effet mesurable depuis l'appel.
                  </div>
                )}
              </div>
            </div>
          )}

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
                  {subs.rows.map((s, idx) => {
                    const st = SUB_STATUS[s.status] ?? {
                      label: s.status,
                      cls: 'badge badge-neutral',
                    };
                    return (
                      <div
                        key={s.id}
                        className="r-stack"
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
          <Card title="Coordonnées">
            <Row label="Email" value={investor.email} />
            <Row label="Téléphone" value={investor.phone ?? '—'} />
            <Row label="Adresse" value={fullAddress(investor)} />
            <Row label="Résidence fiscale" value={investor.taxResidencyCountry ?? '—'} />
          </Card>

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
            <Row
              label="Solde portefeuille"
              value={
                investor.walletBalanceCents != null
                  ? fmtMoney(Math.round(investor.walletBalanceCents / 100))
                  : '—'
              }
            />
          </Card>

          <Card title="Dates (SAH)">
            <Row label="Créé le" value={fmtDateTime(investor.sahCreatedAt)} />
            <Row label="Modifié le" value={fmtDateTime(investor.sahUpdatedAt)} />
          </Card>

          <Card title="Identité">
            <Row label="Civilité" value={civ || '—'} />
            <Row label="Date de naissance" value={fmtBirthdate(investor.dateOfBirth)} />
            <Row label="Nationalité" value={investor.nationality ?? '—'} />
          </Card>

          <Card title="Apporteur">
            <Row label="Code bonus" value={investor.bonusCode ?? '—'} />
            <Row label="CGP" value={investor.cgpName ?? '—'} />
            <Row label="Réseau CGP" value={investor.cgpNetwork ?? '—'} />
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
