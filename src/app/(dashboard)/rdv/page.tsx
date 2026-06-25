import {
  AlertTriangle,
  CalendarClock,
  CalendarX2,
  CheckCircle2,
  Clock,
  PlugZap,
  RotateCcw,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { getAuthenticatedUser } from '@/lib/auth';
import { getRdvBoard, type RdvReel, type RdvStatut } from '@/lib/integrations/calendly/rdv';

export const dynamic = 'force-dynamic';

/**
 * RDV Guillaume — agenda Calendly réel + suivi des leads issus des RDV.
 *
 * Données lues à la volée depuis Calendly (read-only) et reliées aux fiches
 * investisseurs par email. Si Calendly n'est pas joignable, un panneau explicite
 * l'indique (clé manquante / erreur) au lieu d'afficher de fausses données.
 */

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

function fmtJour(d: Date): string {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
function fmtHeure(d: Date): string {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function statutBadge(s: RdvStatut): { label: string; cls: string } {
  switch (s) {
    case 'a_venir':
      return { label: 'À venir', cls: 'badge-brand' };
    case 'honore':
      return { label: 'Honoré', cls: 'badge-success' };
    case 'no_show':
      return { label: 'No-show', cls: 'badge-danger' };
    case 'reporte':
      return { label: 'Reporté', cls: 'badge-warning' };
    case 'annule':
      return { label: 'Annulé', cls: 'badge-neutral' };
  }
}

function etapeBadge(label: string): string {
  if (label === 'Souscrit') return 'badge-success';
  if (label === 'Perdu') return 'badge-danger';
  if (label === 'Dormant') return 'badge-warning';
  return 'badge-neutral';
}

export default async function RdvGuillaumePage() {
  await getAuthenticatedUser();
  const board = await getRdvBoard();

  return (
    <>
      {/* En-tête */}
      <div style={{ marginBottom: 16 }}>
        <h1 className="page-title">RDV Guillaume</h1>
        <div className="page-desc">
          Agenda Calendly de Guillaume, suivi des RDV investisseurs (Funnel B) et leads issus des
          rendez-vous.
        </div>
      </div>

      {board.state === 'not_configured' ? (
        <Panel
          tone="warning"
          icon={<PlugZap size={18} />}
          title="Calendly non connecté"
          body={
            <>
              Aucune clé d'accès détectée. Ajoute la variable <code>CALENDLY_TOKEN</code> dans
              Render (Environment), puis recharge cette page.
            </>
          }
        />
      ) : null}

      {board.state === 'error' ? (
        <Panel
          tone="danger"
          icon={<XCircle size={18} />}
          title="Connexion Calendly en échec"
          body={
            <>
              <div style={{ marginBottom: 6 }}>
                La clé est présente, mais l'appel à Calendly a échoué :
              </div>
              <code style={{ fontSize: 12, wordBreak: 'break-word' }}>{board.message}</code>
              <div style={{ marginTop: 8, fontSize: 12 }}>
                Pistes : token invalide/expiré, ou forfait Calendly sans accès API (Standard min.).
              </div>
            </>
          }
        />
      ) : null}

      {board.state === 'ok' ? (
        <Board rdvs={board.board.rdvs} userName={board.board.user.name} />
      ) : null}
    </>
  );
}

function Board({ rdvs, userName }: { rdvs: RdvReel[]; userName: string }) {
  const aVenir = rdvs
    .filter((r) => r.statut === 'a_venir')
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const aRelancer = rdvs.filter(
    (r) => r.statut === 'no_show' || r.statut === 'reporte' || r.statut === 'annule',
  );
  const passes = rdvs.filter((r) => r.statut === 'honore' || r.statut === 'no_show');
  const honores = passes.filter((r) => r.statut === 'honore').length;
  const tauxPresence = passes.length > 0 ? Math.round((honores / passes.length) * 100) : 0;
  const noShows = rdvs.filter((r) => r.statut === 'no_show').length;
  const souscrits = rdvs.filter((r) => r.statut === 'honore' && r.converti).length;
  const tauxConversion = honores > 0 ? Math.round((souscrits / honores) * 100) : 0;

  // Suivi : on trie du plus récent au plus ancien.
  const suivi = [...rdvs].sort((a, b) => b.date.getTime() - a.date.getTime());

  // Agenda groupé par jour.
  const parJour = new Map<string, RdvReel[]>();
  for (const r of aVenir) {
    const key = fmtJour(r.date);
    const arr = parJour.get(key) ?? [];
    arr.push(r);
    parJour.set(key, arr);
  }

  return (
    <>
      {/* Bandeau connexion OK */}
      <Panel
        tone="success"
        icon={<CheckCircle2 size={18} />}
        title={`Connecté à Calendly — ${userName || 'compte OK'}`}
        body={
          <>
            Données en direct depuis Calendly. {rdvs.length} RDV sur les 45 derniers jours + à
            venir, reliés automatiquement aux fiches investisseurs.
          </>
        }
      />

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi
          icon={<CalendarClock size={15} />}
          label="RDV à venir"
          value={String(aVenir.length)}
          hint="planifiés"
        />
        <Kpi
          icon={<CheckCircle2 size={15} />}
          label="Taux de présentation"
          value={passes.length > 0 ? `${tauxPresence}%` : '—'}
          hint={`${honores}/${passes.length} honorés`}
          tone={tauxPresence >= 70 ? 'success' : 'warning'}
        />
        <Kpi
          icon={<CalendarX2 size={15} />}
          label="No-shows"
          value={String(noShows)}
          hint="à relancer"
          tone={noShows > 0 ? 'danger' : 'neutral'}
        />
        <Kpi
          icon={<TrendingUp size={15} />}
          label="RDV → souscription"
          value={honores > 0 ? `${tauxConversion}%` : '—'}
          hint={`${souscrits} souscription(s)`}
          tone="success"
        />
      </div>

      {/* Agenda à venir */}
      <div className="view-card" style={{ marginBottom: 16 }}>
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <CalendarClock size={15} />
            Agenda — prochains RDV
          </div>
          <span className="badge badge-neutral">{aVenir.length}</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {aVenir.length === 0 ? (
            <Empty>Aucun RDV à venir.</Empty>
          ) : (
            Array.from(parJour.entries()).map(([jour, items]) => (
              <div key={jour}>
                <div
                  style={{
                    padding: '8px 20px',
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                    color: 'var(--text-4)',
                    background: 'var(--glass-bg-strong)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {jour}
                </div>
                {items.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 20px',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--text-1)',
                        minWidth: 64,
                      }}
                    >
                      <Clock size={13} style={{ color: 'var(--text-4)' }} />
                      {fmtHeure(r.date)}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <LeadName r={r} />
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                        {r.source}
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
                      {r.montantInvestiEur != null ? EUR.format(r.montantInvestiEur) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* À relancer */}
      <div className="view-card" style={{ marginBottom: 16 }}>
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <AlertTriangle size={15} style={{ color: 'var(--warning)' }} />À relancer — no-shows,
            reportés & annulés
          </div>
          <span className="badge badge-warning">{aRelancer.length}</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {aRelancer.length === 0 ? (
            <Empty>Rien à relancer. 👌</Empty>
          ) : (
            aRelancer.map((r, idx) => {
              const b = statutBadge(r.statut);
              return (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 20px',
                    borderBottom: idx === aRelancer.length - 1 ? 'none' : '1px solid var(--border)',
                  }}
                >
                  <RotateCcw size={15} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <LeadName r={r} />
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                      RDV du {fmtJour(r.date)} · {r.source}
                    </div>
                  </div>
                  <span className={`badge ${b.cls}`}>{b.label}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Suivi des leads */}
      <div className="view-card">
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <TrendingUp size={15} />
            Suivi des leads issus des RDV
          </div>
          <span className="badge badge-neutral">{suivi.length}</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {suivi.length === 0 ? (
            <Empty>Aucun RDV sur la période.</Empty>
          ) : (
            <div className="table-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-4)' }}>
                    <Th>Lead</Th>
                    <Th>Source</Th>
                    <Th>Date RDV</Th>
                    <Th>RDV</Th>
                    <Th>Étape pipeline</Th>
                    <Th align="right">Investi</Th>
                  </tr>
                </thead>
                <tbody>
                  {suivi.map((r) => {
                    const b = statutBadge(r.statut);
                    return (
                      <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <Td>
                          <LeadName r={r} />
                          {r.email ? (
                            <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{r.email}</div>
                          ) : null}
                        </Td>
                        <Td>{r.source}</Td>
                        <Td>
                          {r.date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}{' '}
                          · {fmtHeure(r.date)}
                        </Td>
                        <Td>
                          <span className={`badge ${b.cls}`}>{b.label}</span>
                        </Td>
                        <Td>
                          <span className={`badge ${etapeBadge(r.etape)}`}>{r.etape}</span>
                        </Td>
                        <Td align="right">
                          <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                            {r.montantInvestiEur != null ? EUR.format(r.montantInvestiEur) : '—'}
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function LeadName({ r }: { r: RdvReel }) {
  if (r.investorId) {
    return (
      <Link
        href={`/closing/investor/${r.investorId}`}
        style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand)', textDecoration: 'none' }}
      >
        {r.lead}
      </Link>
    );
  }
  return <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{r.lead}</span>;
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const color =
    tone === 'success'
      ? 'var(--success)'
      : tone === 'warning'
        ? 'var(--warning)'
        : tone === 'danger'
          ? 'var(--danger)'
          : 'var(--text-1)';
  return (
    <div className="view-card">
      <div
        className="view-card-body"
        style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 16 }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--text-3)',
          }}
        >
          {icon}
          {label}
        </span>
        <span style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{hint}</span>
      </div>
    </div>
  );
}

function Panel({
  tone,
  icon,
  title,
  body,
}: {
  tone: 'success' | 'warning' | 'danger';
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}) {
  const border =
    tone === 'success' ? 'var(--success)' : tone === 'danger' ? 'var(--danger)' : 'var(--warning)';
  const bg =
    tone === 'success'
      ? 'var(--success-bg)'
      : tone === 'danger'
        ? 'var(--danger-bg)'
        : 'var(--warning-bg)';
  const text =
    tone === 'success'
      ? 'var(--success-text)'
      : tone === 'danger'
        ? 'var(--danger-text)'
        : 'var(--warning-text)';
  return (
    <div className="view-card" style={{ marginBottom: 16, borderColor: border, background: bg }}>
      <div
        className="view-card-body"
        style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 16 }}
      >
        <span style={{ color: text, flexShrink: 0, marginTop: 1 }}>{icon}</span>
        <div style={{ fontSize: 13, color: text, minWidth: 0 }}>
          <strong style={{ display: 'block', marginBottom: 4 }}>{title}</strong>
          {body}
        </div>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 24, fontSize: 13, color: 'var(--text-3)' }}>{children}</div>;
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      style={{
        padding: '10px 16px',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        textAlign: align,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td style={{ padding: '12px 16px', textAlign: align, color: 'var(--text-2)' }}>{children}</td>
  );
}
