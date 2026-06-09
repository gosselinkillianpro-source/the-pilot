import { ChevronDown, Clock, Flame, Phone, Target, TrendingUp, UserPlus } from 'lucide-react';
import Link from 'next/link';
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
  // Rang global (#1, #2, …) dans l'ordre de la file, pour descendre de haut en bas.
  const rankById = new Map(queue.map((q, i) => [q.id, i + 1]));

  const total = queue.length;
  const newLeads = queue.filter((q) => q.scored.isNewLead).length;
  const newInvestors = queue.filter((q) => q.scored.queueBucket === 2).length;
  const echeance = queue.filter((q) => q.scored.queueBucket === 3).length;
  const hot = queue.filter((q) => q.scored.temperature === 'hot').length;

  return (
    <>
      <div>
        <h1 className="page-title">File d'appels</h1>
        <div className="page-desc">
          Qui appeler maintenant. {nb(total)} personnes en file · chaque liste est rangée dans
          l'ordre (inscrit le plus récent en haut · échéance la plus proche en haut).
        </div>
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
        groups.map((g, gi) => (
          <details key={g.bucket} className="view-card" open={gi < 2}>
            <summary
              className="view-card-header"
              style={{ cursor: 'pointer', listStyle: 'none', alignItems: 'center' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                <ChevronDown size={16} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div className="view-card-title">{g.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{g.goal}</div>
                </div>
              </div>
              <span className="badge badge-neutral">{nb(g.rows.length)}</span>
            </summary>
            <div className="view-card-body" style={{ padding: 0 }}>
              {g.rows.slice(0, PER_BUCKET).map((row, idx) => (
                <QueueRowItem
                  key={row.id}
                  row={row}
                  rank={rankById.get(row.id) ?? 0}
                  myId={user.id}
                  last={idx === Math.min(g.rows.length, PER_BUCKET) - 1}
                />
              ))}
              {g.rows.length > PER_BUCKET && (
                <div style={{ padding: '10px 20px', fontSize: 12, color: 'var(--text-4)' }}>
                  + {nb(g.rows.length - PER_BUCKET)} autres dans cette file (plus bas dans l'ordre).
                </div>
              )}
            </div>
          </details>
        ))
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
  last,
}: {
  row: QueueRow;
  rank: number;
  myId: string;
  last: boolean;
}) {
  const s = row.scored;
  const claimedByMe = row.claimedById === myId;
  const claimedByOther = row.claimedById != null && row.claimedById !== myId;

  return (
    <div
      className="r-stack"
      style={{
        display: 'grid',
        gridTemplateColumns: '30px 1.3fr 1.4fr 56px 210px',
        gap: 12,
        alignItems: 'center',
        padding: '12px 20px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        opacity: claimedByOther ? 0.55 : 1,
        background: claimedByMe ? 'var(--success-bg, #e6f6ec)' : 'transparent',
      }}
    >
      {/* Rang global */}
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-4)' }}>#{rank}</span>

      {/* Identité + statut */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <Link
          href={`/closing/investor/${row.id}`}
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

      {/* Facteurs (transparence) */}
      <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
        {s.factors.join(' · ')}
      </div>

      {/* Priorité + température */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{s.priority}</span>
        <span className={tempClass(s.temperature)} style={{ fontSize: 10 }}>
          {s.temperatureLabel}
        </span>
      </div>

      {/* Actions */}
      <div
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
