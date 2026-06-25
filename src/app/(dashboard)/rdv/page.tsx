import {
  AlertTriangle,
  BellRing,
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
import {
  autoAssignRdvLeads,
  getRdvBoard,
  type RdvAssignResult,
  type RdvReel,
  type RdvStatut,
} from '@/lib/integrations/calendly/rdv';
import { SuiviTable } from './rdv-suivi';

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

interface Reminder {
  investorId: string;
  lead: string;
  kind: 'programme' | 'reprogrammer' | 'depot' | 'finaliser';
  reason: string;
  when: Date | null;
  overdue: boolean;
}

/** Construit les rappels programmés + les relances intelligentes (1 par lead). */
function computeReminders(rdvs: RdvReel[]): Reminder[] {
  const now = Date.now();
  const out: Reminder[] = [];
  const seen = new Set<string>();
  // Le plus récent d'abord pour qu'un lead avec plusieurs RDV soit jugé sur le dernier.
  const ordered = [...rdvs].sort((a, b) => b.date.getTime() - a.date.getTime());

  for (const r of ordered) {
    if (!r.investorId || seen.has(r.investorId)) continue;

    // 1. Rappel déjà programmé → prioritaire, on n'ajoute pas de suggestion en plus.
    if (r.prochainRappel) {
      seen.add(r.investorId);
      out.push({
        investorId: r.investorId,
        lead: r.lead,
        kind: 'programme',
        reason: r.prochainRappel.note?.trim() || 'Rappel programmé',
        when: r.prochainRappel.dueAt,
        overdue: new Date(r.prochainRappel.dueAt).getTime() < now,
      });
      continue;
    }

    // 2. Suggestions intelligentes (lead non converti).
    if (!r.converti) {
      if (r.statut === 'no_show' || r.statut === 'annule' || r.statut === 'reporte') {
        seen.add(r.investorId);
        out.push({
          investorId: r.investorId,
          lead: r.lead,
          kind: 'reprogrammer',
          reason: `RDV ${statutBadge(r.statut).label.toLowerCase()} — reprogrammer un créneau`,
          when: null,
          overdue: false,
        });
      } else if (r.depotSouhaite && (r.montantInvestiEur == null || r.montantInvestiEur === 0)) {
        seen.add(r.investorId);
        const fourchette =
          r.depotSouhaite.minEur != null
            ? `${r.depotSouhaite.minEur.toLocaleString('fr-FR')} €`
            : 'montant évoqué';
        out.push({
          investorId: r.investorId,
          lead: r.lead,
          kind: 'depot',
          reason: `Dépôt souhaité (${fourchette}${r.depotSouhaite.quand ? `, ${r.depotSouhaite.quand}` : ''}) non concrétisé — relancer`,
          when: null,
          overdue: false,
        });
      } else if (r.statut === 'honore') {
        seen.add(r.investorId);
        out.push({
          investorId: r.investorId,
          lead: r.lead,
          kind: 'finaliser',
          reason: 'RDV honoré — relancer pour finaliser',
          when: null,
          overdue: false,
        });
      }
    }
  }

  // Programmés en retard d'abord, puis programmés à venir, puis suggestions.
  return out.sort((a, b) => {
    const rank = (x: Reminder) => (x.kind === 'programme' ? (x.overdue ? 0 : 1) : 2);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.when && b.when) return a.when.getTime() - b.when.getTime();
    return 0;
  });
}

export default async function RdvGuillaumePage() {
  const user = await getAuthenticatedUser();
  const board = await getRdvBoard();

  // Assignation auto : tout lead issu d'un RDV Calendly est rattaché à Guillaume.
  let assign: RdvAssignResult | null = null;
  if (board.state === 'ok') {
    assign = await autoAssignRdvLeads(board.board, user);
  }

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
        <Board rdvs={board.board.rdvs} userName={board.board.user.name} assign={assign} />
      ) : null}
    </>
  );
}

function Board({
  rdvs,
  userName,
  assign,
}: {
  rdvs: RdvReel[];
  userName: string;
  assign: RdvAssignResult | null;
}) {
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

  // Rappels programmés + relances intelligentes.
  const reminders = computeReminders(rdvs);

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
            <AssignNote assign={assign} />
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

      {/* Rappels & relances intelligentes */}
      <div className="view-card" style={{ marginBottom: 16 }}>
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <BellRing size={15} style={{ color: 'var(--ai)' }} />
            Rappels & relances intelligentes
          </div>
          <span className="badge badge-neutral">{reminders.length}</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {reminders.length === 0 ? (
            <Empty>Aucune relance à prévoir pour l'instant.</Empty>
          ) : (
            reminders.map((rem, idx) => (
              <ReminderRow key={rem.investorId} rem={rem} last={idx === reminders.length - 1} />
            ))
          )}
        </div>
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
                      <span
                        style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                      >
                        <LeadName r={r} />
                        {r.statutInscription ? (
                          <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                            {r.statutInscription}
                          </span>
                        ) : null}
                        {r.score != null ? (
                          <span className="badge badge-brand" style={{ fontSize: 10 }}>
                            score {r.score}
                          </span>
                        ) : null}
                      </span>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                        {r.source}
                        {r.derniereAction ? ` · dernière action : ${r.derniereAction.label}` : ''}
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
            <SuiviTable rows={suivi} />
          )}
        </div>
      </div>
    </>
  );
}

function ReminderRow({ rem, last }: { rem: Reminder; last: boolean }) {
  const color =
    rem.kind === 'programme'
      ? rem.overdue
        ? 'var(--danger)'
        : 'var(--brand)'
      : rem.kind === 'depot'
        ? 'var(--success)'
        : 'var(--warning)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 20px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <Link
          href={`/closing/investor/${rem.investorId}`}
          style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand)', textDecoration: 'none' }}
        >
          {rem.lead}
        </Link>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{rem.reason}</div>
      </div>
      {rem.kind === 'programme' && rem.when ? (
        <span
          className={`badge ${rem.overdue ? 'badge-danger' : 'badge-brand'}`}
          style={{ fontSize: 11, whiteSpace: 'nowrap' }}
        >
          {rem.overdue ? 'En retard · ' : ''}
          {new Date(rem.when).toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ) : (
        <span className="badge badge-neutral" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
          Suggestion
        </span>
      )}
    </div>
  );
}

function AssignNote({ assign }: { assign: RdvAssignResult | null }) {
  if (!assign) return null;
  if (!assign.ownerFound) {
    return (
      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600 }}>
        ⚠️ Assignation auto impossible : aucun compte utilisateur « Guillaume Gosselin » trouvé dans
        THE PILOT. Crée-le (ou vérifie son email) pour activer le rattachement.
      </div>
    );
  }
  const owner = assign.ownerName ?? 'Guillaume';
  return (
    <div style={{ marginTop: 8, fontSize: 12 }}>
      ↳ Leads des RDV Calendly automatiquement assignés à <strong>{owner}</strong>
      {assign.assigned > 0
        ? ` — ${assign.assigned} fiche${assign.assigned > 1 ? 's' : ''} mise${assign.assigned > 1 ? 's' : ''} à jour à l'ouverture.`
        : ' — tout est déjà à jour.'}
    </div>
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
