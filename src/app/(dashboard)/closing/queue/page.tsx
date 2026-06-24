import {
  Clock,
  Flame,
  MessageSquare,
  Phone,
  PhoneCall,
  StickyNote,
  Target,
  TrendingUp,
  UserPlus,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { QueueAccordion, QueueSection } from '@/components/closing/call-queue-accordion';
import { ClaimControl } from '@/components/closing/claim-control';
import { MarkCalledButton } from '@/components/closing/mark-called-button';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getCallQueue,
  groupByBucket,
  type QueueRow,
  type QueueSource,
} from '@/lib/db/queries/call-queue';

export const dynamic = 'force-dynamic';

const SOURCE_TABS: { value: QueueSource; label: string }[] = [
  { value: 'breach', label: 'BREACH (mes pubs)' },
  { value: 'all', label: 'Tous' },
  { value: 'other', label: 'Hors BREACH' },
];

const PER_BUCKET = 40; // on affiche les plus prioritaires de chaque file
// Seuil d'alerte : beaucoup de nouveaux inscrits (7 j) à rappeler pour 2 closers.
const NEW_LEADS_ALERT = 60;

function nb(n: number): string {
  return n.toLocaleString('fr-FR');
}

/** Date + heure précises (ex. « 4 juin 2026 à 14:32 »). */
function fmtDateTime(d: Date | null): string {
  if (!d) return '';
  return new Date(d).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function tempClass(t: QueueRow['scored']['temperature']): string {
  if (t === 'hot') return 'badge badge-danger';
  if (t === 'warm') return 'badge badge-warning';
  return 'badge badge-neutral';
}

function statusClass(s: QueueRow['scored']['status']): string {
  if (s === 'E') return 'badge badge-success';
  if (s === 'B' || s === 'A') return 'badge badge-brand';
  return 'badge badge-neutral';
}

const OUTCOME_LABEL: Record<string, string> = {
  reached: 'Joint',
  no_answer: 'Pas de réponse',
  voicemail: 'Répondeur',
  wrong_number: 'Faux numéro',
  callback_scheduled: 'Rappel programmé',
};
const TYPE_LABEL: Record<string, string> = {
  call_outbound: 'Appel',
  call_inbound: 'Appel entrant',
  email_sent: 'Email envoyé',
  email_opened: 'Email ouvert',
  email_clicked: 'Email cliqué',
  note_added: 'Note',
};

/** Libellé court de la dernière activité (résultat d'appel, email, ou note). */
function lastActivityLabel(la: NonNullable<QueueRow['lastActivity']>): string {
  if (la.outcome) {
    const o = OUTCOME_LABEL[la.outcome];
    if (o) return o;
  }
  if (la.note?.trim()) return la.note.trim();
  return TYPE_LABEL[la.type] ?? la.type;
}

/** « il y a 2 j / 3 h / 12 min ». */
function relativeTime(d: Date | null): string {
  if (!d) return '';
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export default async function CallQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const sp = await searchParams;
  // Par défaut on affiche les leads BREACH (les pubs de Killian) : c'est le périmètre
  // de travail prioritaire. Les onglets permettent de basculer sur Tous / Hors BREACH.
  const source: QueueSource =
    sp.source === 'all' ? 'all' : sp.source === 'other' ? 'other' : 'breach';

  const [queue, user] = await Promise.all([
    getCallQueue({ excludeWon: true, source }),
    getAuthenticatedUser(),
  ]);
  const groups = groupByBucket(queue);
  // Lien de la liste courante : sert au bouton « Retour » de la fiche (revenir ici).
  const listHref = source === 'breach' ? '/closing/queue' : `/closing/queue?source=${source}`;
  // Rang global (#1, #2, …) dans l'ordre de la file, pour descendre de haut en bas.
  const rankById = new Map(queue.map((q, i) => [q.id, i + 1]));

  const total = queue.length;
  const newLeads = queue.filter((q) => q.scored.isNewLead).length;
  const newInvestors = queue.filter((q) => q.scored.queueBucket === 2).length;
  const idleCash = queue.filter((q) => q.scored.queueBucket === 3).length;
  const echeance = queue.filter((q) => q.scored.queueBucket === 4).length;
  const hot = queue.filter((q) => q.scored.temperature === 'hot').length;

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 className="page-title">File d'appels</h1>
          <div className="page-desc">
            Qui appeler maintenant. {nb(total)} personnes en file · chaque liste est rangée dans
            l'ordre (inscrit le plus récent en haut · échéance la plus proche en haut).
          </div>
        </div>
        <Link href="/closing/session" className="btn btn-primary">
          <PhoneCall size={15} />
          Démarrer une session d'appels
        </Link>
      </div>

      {/* Filtre source : BREACH (pubs de Killian) vs reste */}
      <div style={{ display: 'flex', gap: 6 }}>
        {SOURCE_TABS.map((t) => {
          const active = source === t.value;
          return (
            <Link
              key={t.value}
              href={t.value === 'breach' ? '/closing/queue' : `/closing/queue?source=${t.value}`}
              className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
            >
              {t.value === 'breach' ? <Target size={13} /> : null}
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <Kpi
          icon={<Clock size={15} />}
          label="Nouveaux (7 j)"
          value={nb(newLeads)}
          accent="var(--brand)"
        />
        <Kpi
          icon={<UserPlus size={15} />}
          label="Nouv. investisseurs"
          value={nb(newInvestors)}
          accent="var(--ai)"
        />
        <Kpi
          icon={<Wallet size={15} />}
          label="Argent à placer"
          value={nb(idleCash)}
          accent="var(--success)"
        />
        <Kpi
          icon={<TrendingUp size={15} />}
          label="Échéance proche"
          value={nb(echeance)}
          accent="var(--success)"
        />
        <Kpi icon={<Flame size={15} />} label="Chauds" value={nb(hot)} accent="var(--danger)" />
        <Kpi icon={<Phone size={15} />} label="En file" value={nb(total)} accent="var(--text-3)" />
      </div>

      {newLeads > NEW_LEADS_ALERT && (
        <div className="alert alert-warning">
          <span className="alert-icon">
            <Clock size={16} />
          </span>
          <div className="alert-body">
            <div className="alert-title">Beaucoup de nouveaux à rappeler</div>
            <div className="alert-description">
              {nb(newLeads)} nouveaux inscrits (7 derniers jours) en file. Objectif : un 1er appel
              sous 48h. Priorise le haut de liste, ou bascule les profils froids sur l'e-mail
              automatique.
            </div>
          </div>
        </div>
      )}

      {total === 0 ? (
        <div className="view-card">
          <div className="view-card-body" style={{ padding: 24, color: 'var(--text-3)' }}>
            Aucun investisseur en file. Lance une synchronisation SAH si la base est vide.
          </div>
        </div>
      ) : (
        <QueueAccordion source={source} firstBucket={groups[0]?.bucket ?? null}>
          {groups.map((g) => (
            <QueueSection
              key={g.bucket}
              bucket={g.bucket}
              label={g.label}
              goal={g.goal}
              count={g.rows.length}
            >
              {g.rows.slice(0, PER_BUCKET).map((row, idx) => (
                <QueueRowItem
                  key={row.id}
                  row={row}
                  rank={rankById.get(row.id) ?? 0}
                  myId={user.id}
                  backHref={listHref}
                  last={idx === Math.min(g.rows.length, PER_BUCKET) - 1}
                />
              ))}
              {g.rows.length > PER_BUCKET && (
                <div style={{ padding: '10px 20px', fontSize: 12, color: 'var(--text-4)' }}>
                  + {nb(g.rows.length - PER_BUCKET)} autres dans cette file (plus bas dans l'ordre).
                </div>
              )}
            </QueueSection>
          ))}
        </QueueAccordion>
      )}
    </>
  );
}

function Kpi({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="view-card">
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: accent, fontSize: 12 }}
        >
          {icon}
          {label}
        </span>
        <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}>{value}</span>
      </div>
    </div>
  );
}

function QueueRowItem({
  row,
  rank,
  myId,
  backHref,
  last,
}: {
  row: QueueRow;
  rank: number;
  myId: string;
  backHref: string;
  last: boolean;
}) {
  const s = row.scored;
  const claimedByMe = row.claimedById === myId;
  const claimedByOther = row.claimedById != null && row.claimedById !== myId;

  return (
    <div
      className="queue-row"
      style={{
        padding: '12px 16px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        opacity: claimedByOther ? 0.55 : 1,
        background: claimedByMe ? 'var(--success-bg, #e6f6ec)' : 'transparent',
      }}
    >
      {/* Rang global */}
      <span
        className="queue-rank"
        style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-4)' }}
      >
        #{rank}
      </span>

      {/* Identité + statut */}
      <div
        className="queue-identity"
        style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}
      >
        <Link
          href={`/closing/investor/${row.id}?from=${encodeURIComponent(backHref)}`}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-1)',
            textDecoration: 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.fullName ?? row.email}
        </Link>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={statusClass(s.status)} style={{ fontSize: 10 }}>
            {s.statusLabel}
          </span>
          {row.isBreach ? (
            <span
              className="badge"
              style={{
                fontSize: 10,
                background: 'var(--ai-bg, #ede9fe)',
                color: 'var(--ai, #7c3aed)',
                fontWeight: 700,
              }}
              title={row.bonusCode ?? 'BREACH'}
            >
              BREACH
            </span>
          ) : null}
          {claimedByOther ? (
            <span className="badge badge-warning" style={{ fontSize: 10 }}>
              en cours — {row.claimerName ?? 'un closer'}
            </span>
          ) : null}
          {claimedByMe ? (
            <span className="badge badge-success" style={{ fontSize: 10 }}>
              tu travailles dessus
            </span>
          ) : null}
          {row.assignedCloserId ? (
            row.assignedCloserId === myId ? (
              <span
                className="badge badge-brand"
                style={{ fontSize: 10 }}
                title="C'est ton lead attitré : tu en es le correspondant"
              >
                ★ ton lead
              </span>
            ) : (
              <span
                className="badge badge-neutral"
                style={{ fontSize: 10 }}
                title="Suivi par un closer attitré"
              >
                suivi&nbsp;: {row.assignedCloserName ?? 'un closer'}
              </span>
            )
          ) : null}
          {row.city ? (
            <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{row.city}</span>
          ) : null}
          {row.walletBalanceCents != null && row.walletBalanceCents >= 10000 ? (
            <span
              className="badge"
              style={{
                fontSize: 10,
                background: 'var(--success-bg, #e6f6ec)',
                color: 'var(--success)',
                fontWeight: 700,
              }}
              title="Argent disponible dans le wallet, non investi"
            >
              💰 {nb(Math.round(row.walletBalanceCents / 100))} € dispo
            </span>
          ) : null}
        </div>
        {row.sahCreatedAt ? (
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-4)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            title="Date et heure d'inscription (Seven At Home)"
          >
            <Clock size={11} />
            Inscrit le {fmtDateTime(row.sahCreatedAt)}
          </span>
        ) : null}
      </div>

      {/* Facteurs (transparence) + note libre + dernière activité */}
      <div
        className="queue-factors"
        style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}
      >
        {s.factors.join(' · ')}
        {row.internalNote ? (
          <div
            style={{
              marginTop: 4,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 5,
              maxWidth: '100%',
              fontSize: 11,
              color: 'var(--text-1)',
              background: 'var(--warning-bg, #fdf6e3)',
              border: '1px solid color-mix(in srgb, var(--warning) 45%, transparent)',
              borderRadius: 6,
              padding: '3px 7px',
            }}
            title={row.internalNote}
          >
            <StickyNote
              size={11}
              style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }}
            />
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {row.internalNote}
            </span>
          </div>
        ) : null}
        {row.lastActivity ? (
          <div
            style={{
              marginTop: 4,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              maxWidth: '100%',
              fontSize: 11,
              color: 'var(--text-2)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '2px 7px',
            }}
            title={`Dernière activité : ${lastActivityLabel(row.lastActivity)}`}
          >
            <MessageSquare size={11} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lastActivityLabel(row.lastActivity)}
            </span>
            {row.lastActivity.at ? (
              <span style={{ color: 'var(--text-4)', flexShrink: 0 }}>
                · {relativeTime(row.lastActivity.at)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Priorité + température */}
      <div
        className="queue-priority"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
      >
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{s.priority}</span>
        <span className={tempClass(s.temperature)} style={{ fontSize: 10 }}>
          {s.temperatureLabel}
        </span>
      </div>

      {/* Actions */}
      <div
        className="queue-actions"
        style={{
          display: 'flex',
          gap: 6,
          justifyContent: 'flex-end',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {claimedByOther ? (
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>pris</span>
        ) : (
          <>
            <ClaimControl investorId={row.id} claimedByMe={claimedByMe} />
            {row.phone ? (
              <a href={`tel:${row.phone}`} className="btn btn-primary btn-sm" aria-label="Appeler">
                <Phone size={13} />
              </a>
            ) : null}
            <MarkCalledButton investorId={row.id} name={row.fullName ?? row.email} />
          </>
        )}
      </div>
    </div>
  );
}
