import { ChevronDown, Clock, Flame, Phone, Target, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { ClaimControl } from '@/components/closing/claim-control';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getCallQueue,
  groupByBucket,
  type QueueRow,
  type QueueSource,
} from '@/lib/db/queries/call-queue';

export const dynamic = 'force-dynamic';

const SOURCE_TABS: { value: QueueSource; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'breach', label: 'BREACH (mes pubs)' },
  { value: 'other', label: 'Hors BREACH' },
];

const PER_BUCKET = 40; // on affiche les plus prioritaires de chaque file
// Capacité indicative de 2 closers sur la règle des 48h (à ajuster).
const CAPACITY_48H = 30;

function nb(n: number): string {
  return n.toLocaleString('fr-FR');
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
  const source: QueueSource =
    sp.source === 'breach' ? 'breach' : sp.source === 'other' ? 'other' : 'all';

  const [queue, user] = await Promise.all([
    getCallQueue({ excludeWon: true, source }),
    getAuthenticatedUser(),
  ]);
  const groups = groupByBucket(queue);
  // Rang global (#1, #2, …) dans l'ordre de la file, pour descendre de haut en bas.
  const rankById = new Map(queue.map((q, i) => [q.id, i + 1]));

  const total = queue.length;
  const in48h = queue.filter((q) => q.scored.within48h).length;
  const echeance = queue.filter((q) => q.scored.queueBucket === 2).length;
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
              href={t.value === 'all' ? '/closing/queue' : `/closing/queue?source=${t.value}`}
              className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
            >
              {t.value === 'breach' ? <Target size={13} /> : null}
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Kpi
          icon={<Clock size={15} />}
          label="Nouveaux (48h)"
          value={nb(in48h)}
          accent="var(--brand)"
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

      {in48h > CAPACITY_48H && (
        <div className="alert alert-warning">
          <span className="alert-icon">
            <Clock size={16} />
          </span>
          <div className="alert-body">
            <div className="alert-title">Capacité 48h dépassée</div>
            <div className="alert-description">
              {nb(in48h)} nouveaux inscrits à rappeler sous 48h, au-delà de la capacité indicative
              de {CAPACITY_48H} pour 2 closers. Priorise par score, ou bascule les profils froids
              sur l'e-mail automatique.
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
      style={{
        display: 'grid',
        gridTemplateColumns: '34px 1.3fr 1.5fr 64px 180px',
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
          {row.city ? (
            <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{row.city}</span>
          ) : null}
        </div>
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
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
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
            <Link href={`/closing/investor/${row.id}`} className="btn btn-secondary btn-sm">
              Fiche
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
