import {
  AlertTriangle,
  CalendarClock,
  CalendarX2,
  CheckCircle2,
  RotateCcw,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { LiveSync } from '@/components/shared/live-sync';
import { getAuthenticatedUser } from '@/lib/auth';
import { getContactIdsByEmails, upsertRdvContacts } from '@/lib/db/queries/rdv-contacts';
import { listReminders, listReminderTargets } from '@/lib/db/queries/reminders';
import { listPipelineCards, type PipelineCard } from '@/lib/db/queries/webinar-pipeline';
import {
  autoAssignRdvLeads,
  getRdvBoard,
  type RdvAssignResult,
  type RdvBoardResult,
  type RdvReel,
  type RdvStatut,
} from '@/lib/integrations/calendly/rdv';
import { listRdvCloser, resolveRdvAccess } from '@/lib/rdv/access';
import { SYNC_TOPICS } from '@/lib/realtime/topics';
import { Agenda, type AgendaItem, NextUp } from './agenda';
import { BrokenConnection, CloserSwitcher, ConnectPrompt } from './connection-panel';
import { LeadsBoard } from './leads-board';
import { SuiviTable } from './rdv-suivi';
import { Reminders } from './reminders';

/** Ce qu'on lit sous le nom, dans une case d'agenda. */
const STATUT_AGENDA: Record<string, string> = {
  a_venir: 'à venir',
  honore: 'honoré',
  no_show: 'no-show',
  reporte: 'reporté',
  annule: 'annulé',
};

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

/**
 * Appel Calendly blindé : une panne inattendue (réseau, API) devient un état
 * d'erreur affichable — jamais une page morte. Les rappels et le suivi des
 * leads vivent en base, ils doivent rester visibles quoi qu'il arrive.
 */
async function safeGetRdvBoard(accessToken?: string): Promise<RdvBoardResult> {
  try {
    return await getRdvBoard(accessToken);
  } catch (e) {
    return { state: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

export default async function RdvPage({
  searchParams,
}: {
  searchParams: Promise<{ closer?: string; calendly?: string; erreur?: string; detail?: string }>;
}) {
  const params = await searchParams;
  const user = await getAuthenticatedUser();

  // De quel agenda parle-t-on ? Le sien par défaut ; celui d'un autre seulement
  // si l'admin le demande explicitement (le contrôle est fait dans resolveRdvAccess).
  const access = await resolveRdvAccess(user, params.closer);
  const closers = await listRdvCloser(user);

  const board: RdvBoardResult =
    access.state === 'connected'
      ? await safeGetRdvBoard(access.accessToken)
      : access.state === 'not_connected'
        ? // Pas de connexion OAuth propre : getRdvBoard sans jeton retombe sur
          // l'ancien token global CALENDLY_TOKEN s'il est encore posé (la page
          // historique de Guillaume, le temps que chacun relie son compte), et
          // répond not_configured sinon.
          await safeGetRdvBoard()
        : ({ state: 'not_configured' } as const);

  // Assignation auto : les leads issus d'un RDV reviennent au closer de l'agenda.
  let assign: RdvAssignResult | null = null;
  if (board.state === 'ok' && access.state === 'connected') {
    // Propriétaire explicite : le compte dont on lit l'agenda. Plus aucune
    // devinette sur le nom — c'est ce qui avait fait réassigner 25 fiches à
    // l'admin au lieu du closer concerné.
    assign = await autoAssignRdvLeads(board.board, user, access.target.userId);
  } else if (board.state === 'ok') {
    // Ancien token global, le temps que chacun relie son compte.
    assign = await autoAssignRdvLeads(board.board, user);
  }

  const targetName =
    access.state === 'no_target' ? '—' : (access.target.name ?? access.target.email);
  const isOtherUser = access.state !== 'no_target' && access.target.isOtherUser;

  return (
    <>
      {/* En-tête */}
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <h1 className="page-title">{isOtherUser ? `RDV — ${targetName}` : 'Mes rendez-vous'}</h1>
          <div className="page-desc">
            {isOtherUser
              ? `Agenda Calendly de ${targetName}, consulté en tant qu'administrateur.`
              : 'Ton agenda Calendly, le suivi de chaque contact et les leads issus des rendez-vous.'}
          </div>
        </div>
        {/* Plusieurs mains sur les mêmes leads : le kanban partagé émet sur
            `webinars` (moveCardAction), rappels et comptes-rendus sur `closing`,
            et la synchro SAH horaire sur `sah`. Sans cette écoute, l'écran d'un
            closer restait figé sur l'état de son dernier chargement. */}
        <LiveSync topics={[SYNC_TOPICS.closing, SYNC_TOPICS.webinars, SYNC_TOPICS.sah]} showBadge />
      </div>

      {closers.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <CloserSwitcher
            closers={closers}
            activeUserId={access.state === 'no_target' ? user.id : access.target.userId}
          />
        </div>
      )}

      {params.calendly === 'connecte' && (
        <div className="view-card" style={{ borderColor: 'var(--success)' }}>
          <div className="view-card-body" style={{ fontSize: 13 }}>
            ✅ Calendly connecté. Tes rendez-vous vont apparaître ci-dessous.
          </div>
        </div>
      )}

      {params.erreur && (
        <div className="view-card" style={{ borderColor: 'var(--danger)' }}>
          <div className="view-card-body" style={{ fontSize: 13 }}>
            <strong>La connexion Calendly a échoué</strong> ({params.erreur})
            {params.detail ? (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-3)' }}>
                {params.detail}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {access.state === 'no_target' && (
        <div className="view-card" style={{ borderColor: 'var(--warning)' }}>
          <div className="view-card-body" style={{ fontSize: 13 }}>
            <strong>Compte introuvable dans THE PILOT.</strong>
            <div style={{ color: 'var(--text-3)', marginTop: 4 }}>
              Impossible de savoir de quel agenda il s'agit. En développement local, c'est attendu :
              l'utilisateur de contournement n'a pas de fiche en base.
            </div>
          </div>
        </div>
      )}

      {access.state === 'not_connected' && (
        <ConnectPrompt
          targetName={targetName}
          isOtherUser={isOtherUser}
          targetUserId={access.target.userId}
          canDelegate={user.role === 'admin'}
        />
      )}
      {access.state === 'connection_broken' && <BrokenConnection message={access.message} />}

      {board.state === 'error' ? (
        <Panel
          tone="danger"
          icon={<XCircle size={18} />}
          title="Agenda Calendly indisponible"
          body={
            <>
              <div style={{ marginBottom: 6 }}>
                La clé est présente, mais l'appel à Calendly a échoué :
              </div>
              <code style={{ fontSize: 12, wordBreak: 'break-word' }}>{board.message}</code>
              <div style={{ marginTop: 8, fontSize: 12 }}>
                Pistes : token invalide/expiré, ou forfait Calendly sans accès API (Standard min.).
                Les rappels et le suivi des leads restent affichés ci-dessous.
              </div>
            </>
          }
        />
      ) : null}

      {board.state === 'ok' ? (
        <Board
          rdvs={board.board.rdvs}
          userName={board.board.user.name}
          assign={assign}
          ownerUserId={access.state === 'no_target' ? user.id : access.target.userId}
          viewerId={user.id}
        />
      ) : access.state !== 'no_target' ? (
        // Calendly absent, non relié ou en panne : les rappels et les fiches de
        // suivi vivent en base, pas chez Calendly — on les affiche quoi qu'il
        // arrive. Seul l'agenda (RDV lus en direct) dépend de l'API.
        <LocalBoard ownerUserId={access.target.userId} viewerId={user.id} />
      ) : null}
    </>
  );
}

/**
 * La partie de la page qui vit chez NOUS : rappels + suivi des leads rencontrés.
 * Rendue seule quand Calendly est injoignable — un rappel « rappeler Mme X
 * mercredi » ne doit jamais disparaître de toutes les vues parce qu'un token
 * a été révoqué.
 */
async function LocalBoard({ ownerUserId, viewerId }: { ownerUserId: string; viewerId: string }) {
  const [leadCards, reminders, reminderTargets] = await Promise.all([
    listPipelineCards(undefined, 'calendly'),
    listReminders(ownerUserId),
    listReminderTargets(ownerUserId),
  ]);

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Reminders reminders={reminders} targets={reminderTargets} ownerUserId={ownerUserId} />
      </div>
      <LeadsCard cards={leadCards} viewerId={viewerId} />
    </>
  );
}

async function Board({
  rdvs: rdvsFromCalendly,
  userName,
  assign,
  ownerUserId,
  viewerId,
}: {
  rdvs: RdvReel[];
  userName: string;
  assign: RdvAssignResult | null;
  /** Compte dont on lit l'agenda : c'est LUI qui possède les fiches et les rappels. */
  ownerUserId: string;
  /** Utilisateur connecté, pour distinguer « ma fiche » de celle d'un collègue. */
  viewerId: string;
}) {
  // Chaque personne rencontrée reçoit une fiche AVANT tout affichage : c'est
  // elle qui porte le suivi (appels, notes, rappels), y compris pour un
  // prospect pas encore inscrit SAH. Best-effort : une fiche qui ne se crée
  // pas ne doit jamais faire tomber l'agenda.
  try {
    await upsertRdvContacts(
      rdvsFromCalendly.map((r) => ({
        email: r.email ?? '',
        fullName: r.lead,
        phone: r.phone,
        statut: r.statut,
        investorId: r.investorId,
      })),
      ownerUserId,
    );
  } catch (e) {
    console.error('upsertRdvContacts failed:', e instanceof Error ? e.message : e);
  }

  // Relie chaque RDV à sa fiche prospect : c'est ce qui rend le lead CLIQUABLE
  // même hors base SAH (enregistrer les appels, notes, téléphone).
  let contactIds = new Map<string, string>();
  try {
    contactIds = await getContactIdsByEmails(rdvsFromCalendly.map((r) => r.email ?? ''));
  } catch (e) {
    console.error('getContactIdsByEmails failed:', e instanceof Error ? e.message : e);
  }
  const rdvs = rdvsFromCalendly.map((r) =>
    r.email ? { ...r, contactId: contactIds.get(r.email.toLowerCase()) ?? null } : r,
  );

  // Total investi par les leads Calendly de Guillaume (1 fois par investisseur, vraies souscriptions).
  const investiParInvestisseur = new Map<string, number>();
  for (const r of rdvs) {
    if (r.investorId) investiParInvestisseur.set(r.investorId, r.montantInvestiEur ?? 0);
  }
  const totalInvesti = [...investiParInvestisseur.values()].reduce((a, b) => a + b, 0);
  const leadsCount = investiParInvestisseur.size;
  const investedCount = [...investiParInvestisseur.values()].filter((v) => v > 0).length;
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

  const [leadCards, reminders, reminderTargets] = await Promise.all([
    listPipelineCards(undefined, 'calendly'),
    listReminders(ownerUserId),
    listReminderTargets(ownerUserId),
  ]);

  // L'agenda mêle rendez-vous et rappels : la journée d'un closer, c'est les
  // deux, et les séparer garantit qu'on en oublie la moitié.
  const agendaItems: AgendaItem[] = [
    ...rdvs.map((r) => ({
      id: `rdv-${r.id}`,
      kind: 'rdv' as const,
      at: r.date,
      title: r.lead,
      detail: STATUT_AGENDA[r.statut] ?? null,
      href: r.investorId
        ? `/closing/investor/${r.investorId}`
        : r.contactId
          ? `/rdv/contact/${r.contactId}`
          : null,
      tone:
        r.statut === 'no_show' || r.statut === 'annule'
          ? ('danger' as const)
          : r.statut === 'reporte'
            ? ('warning' as const)
            : r.statut === 'honore'
              ? ('done' as const)
              : ('normal' as const),
    })),
    ...reminders.map((rem) => ({
      id: `rappel-${rem.id}`,
      kind: 'rappel' as const,
      at: rem.dueAt,
      title: rem.who ?? 'Rappel',
      detail: rem.note,
      href: rem.investorId ? `/closing/investor/${rem.investorId}` : null,
      tone: rem.overdue ? ('danger' as const) : ('normal' as const),
    })),
  ];

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
          icon={<TrendingUp size={15} />}
          label="Total investi — leads Calendly"
          value={EUR.format(totalInvesti)}
          hint={`${leadsCount} leads · ${investedCount} ont investi`}
          tone="success"
        />
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

      {/* L'agenda d'abord : ce qui arrive, puis la semaine entière. */}
      <div style={{ marginBottom: 16 }}>
        <NextUp items={agendaItems} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Agenda items={agendaItems} />
      </div>

      {/* Les rappels : en créer, les voir arriver, les clore. */}
      <div style={{ marginBottom: 16 }}>
        <Reminders reminders={reminders} targets={reminderTargets} ownerUserId={ownerUserId} />
      </div>

      {/* Le suivi des leads, mêmes gestes que le tableau des webinaires. */}
      <LeadsCard cards={leadCards} viewerId={viewerId} />

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
                      RDV du{' '}
                      {r.date.toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}{' '}
                      · {r.source}
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

/** Carte « Suivi des leads rencontrés » — partagée entre Board et LocalBoard. */
function LeadsCard({ cards, viewerId }: { cards: PipelineCard[]; viewerId: string }) {
  return (
    <div className="view-card" style={{ marginBottom: 16 }}>
      <div className="view-card-header">
        <div>
          <div className="view-card-title">Suivi des leads rencontrés</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 2 }}>
            Une carte par personne vue en rendez-vous. Glisse-la de colonne, ou utilise le sélecteur
            sur la carte.
          </div>
        </div>
        <span className="badge badge-neutral">{cards.length}</span>
      </div>
      <div className="view-card-body">
        {cards.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            Aucun lead suivi pour l'instant. Chaque rendez-vous Calendly crée sa fiche ici dès la
            prochaine ouverture de cette page.
          </div>
        ) : (
          <LeadsBoard cards={cards} myId={viewerId} />
        )}
      </div>
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
  // Inscrit SAH → fiche investisseur ; sinon fiche PROSPECT (appels, notes,
  // téléphone) — un lead de RDV est toujours cliquable.
  const href = r.investorId
    ? `/closing/investor/${r.investorId}`
    : r.contactId
      ? `/rdv/contact/${r.contactId}`
      : null;
  if (href) {
    return (
      <Link
        href={href}
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
