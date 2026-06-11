import { ArrowLeft, CalendarPlus, Phone } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getInvestorScored } from '@/lib/db/queries/call-queue';
import {
  getCallImpact,
  getClosers,
  getInvestorOpenTasks,
  getInvestorTimeline,
  type TimelineItem,
} from '@/lib/db/queries/closing';
import { getLatestAsset } from '@/lib/db/queries/investor-assets';
import {
  getInvestorById,
  getInvestorSubscriptions,
  type InvestorSubscription,
} from '@/lib/db/queries/investors';
import { getInvestorStage } from '@/lib/investor-stage';
import { ActionRowButtons, PlanActionPanel } from './actions-panel';
import { AssignCloser } from './assign-closer';
import { CallBriefPanel, type SavedScript, type ScriptBrief } from './call-brief-panel';
import { CallLogPanel } from './call-log-panel';
import { InvestorEmailPanel, type SavedEmail } from './investor-email-panel';
import { InvestorNotes } from './investor-notes';

type Props = { params: Promise<{ id: string }> };

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

const ACTION_LABEL: Record<string, string> = {
  callback: 'Rappel',
  email: 'Email',
  message: 'Message',
  todo: 'Tâche',
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

  const [subs, scored, timeline, closers, openTasks, callImpact, emailAsset, scriptAsset] =
    await Promise.all([
      getInvestorSubscriptions(investor.id),
      getInvestorScored(investor.id),
      getInvestorTimeline(investor.id),
      getClosers(),
      getInvestorOpenTasks(investor.id),
      getCallImpact(investor.id),
      getLatestAsset(investor.id, 'email_proposal'),
      getLatestAsset(investor.id, 'call_script'),
    ]);
  const firstName = investor.firstName ?? investor.fullName?.split(' ')[0] ?? 'Investisseur';
  const civ = civilityLabel(investor.civility);
  const displayName = [civ, investor.fullName].filter(Boolean).join(' ') || investor.email;

  const savedEmail: SavedEmail | null = emailAsset
    ? {
        id: emailAsset.id,
        status: emailAsset.status,
        subject: emailAsset.subject,
        preheader: emailAsset.preheader,
        body: emailAsset.body,
        costEur: emailAsset.costEur,
        amfWarnings:
          (emailAsset.data as { amfWarnings?: { match: string; suggestedFix: string }[] } | null)
            ?.amfWarnings ?? [],
        error: emailAsset.error,
      }
    : null;
  const savedScript: SavedScript | null = scriptAsset
    ? {
        id: scriptAsset.id,
        status: scriptAsset.status,
        brief: (scriptAsset.data as ScriptBrief | null) ?? null,
        costEur: scriptAsset.costEur,
        error: scriptAsset.error,
      }
    : null;

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
            {(() => {
              const directByCode = investor.bonusCode != null && /breach/i.test(investor.bonusCode);
              if (investor.breachLevel == null && !directByCode) return null;
              const label =
                investor.breachLevel != null && investor.breachLevel > 0
                  ? `BREACH N-${investor.breachLevel}`
                  : 'BREACH direct';
              const parrain =
                investor.breachLevel != null && investor.breachLevel > 0 && investor.parrainName
                  ? ` · parrain : ${investor.parrainName}`
                  : '';
              return (
                <span className="badge badge-ai">
                  {label}
                  {parrain}
                </span>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="split-2col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Priorité d'appel (score transparent) */}
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

          {/* Impact du dernier appel : l'appel a-t-il servi ? (rentabilité) */}
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
                    Pas encore d'effet mesurable depuis l'appel (statut inchangé, pas
                    d'investissement).
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Brief d'appel IA (sauvegardé) */}
          <CallBriefPanel
            key={`script-${savedScript?.id ?? 'none'}-${savedScript?.status ?? 'none'}`}
            investorId={investor.id}
            saved={savedScript}
          />

          {/* Enregistrer un appel */}
          <CallLogPanel investorId={investor.id} />

          {/* Actions planifiées (rappel / email / message / tâche) */}
          <div className="view-card">
            <div className="view-card-header">
              <div
                className="view-card-title"
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <CalendarPlus size={15} />
                Actions planifiées
              </div>
              <span className="badge badge-neutral">{openTasks.length}</span>
            </div>
            <div
              className="view-card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <PlanActionPanel investorId={investor.id} />
              {openTasks.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {openTasks.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 0',
                        borderTop: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <span
                          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                        >
                          <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                            {ACTION_LABEL[t.type] ?? t.type}
                          </span>
                          <span style={{ color: t.overdue ? 'var(--danger)' : 'var(--text-2)' }}>
                            {t.overdue ? '⏰ ' : ''}
                            {fmtDateTime(t.dueAt)}
                          </span>
                        </span>
                        {t.note ? (
                          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                            {t.note}
                          </div>
                        ) : null}
                      </div>
                      <ActionRowButtons taskId={t.id} label={ACTION_LABEL[t.type] ?? undefined} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <InvestorEmailPanel
            key={`email-${savedEmail?.id ?? 'none'}-${savedEmail?.status ?? 'none'}`}
            investorId={investor.id}
            firstName={firstName}
            email={investor.email}
            saved={savedEmail}
          />

          {/* Historique / timeline */}
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
                timeline.map((t: TimelineItem, idx) => (
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
          {/* Notes libres (persistées) — en haut, accès immédiat */}
          <InvestorNotes investorId={investor.id} initialNote={investor.internalNote ?? ''} />

          {/* Suivi closing : assignation */}
          <Card title="Suivi closing">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Closer assigné</span>
              <AssignCloser
                investorId={investor.id}
                current={investor.assignedCloserId}
                closers={closers}
              />
            </div>
          </Card>

          {/* Lemonway / Onboarding — remonté en haut (info clé pour le closer) */}
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

          {/* Dates — remonté en haut (savoir quand le compte a été créé) */}
          <Card title="Dates (SAH)">
            <Row label="Créé le" value={fmtDateTime(investor.sahCreatedAt)} />
            <Row label="Modifié le" value={fmtDateTime(investor.sahUpdatedAt)} />
          </Card>

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
