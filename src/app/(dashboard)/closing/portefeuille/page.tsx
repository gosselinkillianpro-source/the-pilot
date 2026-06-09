import { Briefcase, Phone } from 'lucide-react';
import Link from 'next/link';
import { getClosers } from '@/lib/db/queries/closing';
import { getCloserPortfolio, type PortfolioRow } from '@/lib/db/queries/portfolio';
import { getInvestorStage } from '@/lib/investor-stage';

export const dynamic = 'force-dynamic';

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

function nb(n: number): string {
  return n.toLocaleString('fr-FR');
}

function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

function fmtDateTime(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function PortefeuillePage({
  searchParams,
}: {
  searchParams: Promise<{ closer?: string }>;
}) {
  const sp = await searchParams;
  const closers = await getClosers();
  const selected = closers.find((c) => c.id === sp.closer)?.id;
  const rows = await getCloserPortfolio({ closerId: selected });

  const now = Date.now();
  const totalInvested = rows.reduce((s, r) => s + r.totalInvested, 0);
  const withAction = rows.filter((r) => r.nextActionAt != null).length;
  const overdue = rows.filter(
    (r) => r.nextActionAt != null && new Date(r.nextActionAt).getTime() < now,
  ).length;

  const showCloserCol = !selected; // colonne "Closer" seulement en vue "Tous"

  return (
    <>
      <div>
        <h1 className="page-title">Portefeuille</h1>
        <div className="page-desc">
          Les personnes suivies par chaque closer, avec leur état à jour : étape, dernier appel,
          prochaine action. Accessible à toute l'équipe (couverture si un closer est absent).
        </div>
      </div>

      {/* Sélecteur de closer */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Link
          href="/closing/portefeuille"
          className={`btn btn-sm ${!selected ? 'btn-primary' : 'btn-secondary'}`}
        >
          Tous
        </Link>
        {closers.map((c) => (
          <Link
            key={c.id}
            href={`/closing/portefeuille?closer=${c.id}`}
            className={`btn btn-sm ${selected === c.id ? 'btn-primary' : 'btn-secondary'}`}
          >
            {c.name ?? c.id}
          </Link>
        ))}
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <Kpi label="Leads suivis" value={nb(rows.length)} accent="var(--brand)" />
        <Kpi label="Total investi" value={money(totalInvested)} accent="var(--success)" />
        <Kpi label="Avec action prévue" value={nb(withAction)} accent="var(--ai)" />
        <Kpi label="Actions en retard" value={nb(overdue)} accent="var(--danger)" />
      </div>

      <div className="view-card">
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Briefcase size={15} />
            {selected
              ? (closers.find((c) => c.id === selected)?.name ?? 'Closer')
              : 'Tous les closers'}
          </div>
          <span className="badge badge-neutral">{nb(rows.length)}</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div style={{ padding: 24, fontSize: 13, color: 'var(--text-3)' }}>
              Aucun lead attribué{selected ? ' à ce closer' : ''} pour l'instant. Les personnes
              s'ajoutent ici dès qu'un closer les traite (appel, action).
            </div>
          ) : (
            <>
              <HeaderRow showCloser={showCloserCol} />
              {rows.map((r, idx) => (
                <Row
                  key={r.id}
                  r={r}
                  last={idx === rows.length - 1}
                  showCloser={showCloserCol}
                  now={now}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function gridCols(showCloser: boolean): string {
  return showCloser ? '1.4fr 0.9fr 1.1fr 1.1fr 0.8fr 0.9fr' : '1.6fr 0.9fr 1.2fr 1.2fr 0.9fr';
}

function HeaderRow({ showCloser }: { showCloser: boolean }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: gridCols(showCloser),
        gap: 12,
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--text-4)',
      }}
    >
      <span>Personne</span>
      <span>Étape</span>
      <span>Dernier appel</span>
      <span>Prochaine action</span>
      <span style={{ textAlign: 'right' }}>Investi</span>
      {showCloser && <span>Closer</span>}
    </div>
  );
}

function Row({
  r,
  last,
  showCloser,
  now,
}: {
  r: PortfolioRow;
  last: boolean;
  showCloser: boolean;
  now: number;
}) {
  const stage = getInvestorStage(r);
  const lastCall = !r.lastCallAt
    ? 'Jamais appelé'
    : r.lastCallOutcome
      ? `${OUTCOME_LABEL[r.lastCallOutcome] ?? r.lastCallOutcome} · ${fmtDateTime(r.lastCallAt)}`
      : `À qualifier · ${fmtDateTime(r.lastCallAt)}`;
  const nextOverdue = r.nextActionAt != null && new Date(r.nextActionAt).getTime() < now;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: gridCols(showCloser),
        gap: 12,
        alignItems: 'center',
        padding: '12px 20px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <Link
          href={`/closing/investor/${r.id}`}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {r.fullName ?? '—'}
        </Link>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className={stage.badgeClass} style={{ fontSize: 10 }}>
            {stage.label}
          </span>
          {r.city ? <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{r.city}</span> : null}
        </span>
      </div>

      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
        {STAGE_LABEL[r.stage] ?? r.stage}
      </span>

      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{lastCall}</span>

      <span style={{ fontSize: 12, color: nextOverdue ? 'var(--danger)' : 'var(--text-3)' }}>
        {r.nextActionAt
          ? `${ACTION_LABEL[r.nextActionType ?? ''] ?? 'Action'} · ${nextOverdue ? '⏰ ' : ''}${fmtDateTime(r.nextActionAt)}`
          : '—'}
      </span>

      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', textAlign: 'right' }}>
        {r.totalInvested > 0 ? money(r.totalInvested) : '—'}
      </span>

      {showCloser && (
        <span
          style={{
            fontSize: 12,
            color: 'var(--text-3)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {r.assignedCloserName ?? '—'}
          {r.lastCallAt && r.lastCallOutcome == null ? (
            <span title="Appel à qualifier">
              <Phone size={12} style={{ color: 'var(--warning)' }} />
            </span>
          ) : null}
        </span>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="view-card">
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: accent }}>{label}</span>
        <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}>{value}</span>
      </div>
    </div>
  );
}
