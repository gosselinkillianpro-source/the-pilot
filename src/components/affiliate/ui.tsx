import type { ReactNode } from 'react';

/** Composants présentationnels partagés de l'espace affilié (server-safe). */

export function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

export function pct(n: number, d: number): string {
  if (d <= 0) return '—';
  return `${Math.round((n / d) * 100)} %`;
}

export function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="view-card">
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: accent ?? 'var(--text-3)' }}>{label}</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>{value}</span>
      </div>
    </div>
  );
}

export function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title">{title}</div>
        {action}
      </div>
      <div className="view-card-body" style={{ padding: 0 }}>
        {children}
      </div>
    </div>
  );
}

export function Empty({ label = 'Aucune donnée.' }: { label?: string }) {
  return <div style={{ padding: 20, fontSize: 13, color: 'var(--text-3)' }}>{label}</div>;
}

/** Affiché quand le compte n'est relié à aucun réseau (sah_user_id absent). */
export function NotLinked({ title }: { title: string }) {
  return (
    <>
      <h1 className="page-title">{title}</h1>
      <div className="alert alert-warning" style={{ marginTop: 12 }}>
        <div className="alert-body">
          <div className="alert-title">Compte non relié à un réseau</div>
          <div className="alert-description">
            Ce compte n'est pas encore lié à une personne SAH. Un administrateur doit le relier à un
            code d'affiliation pour afficher le réseau.
          </div>
        </div>
      </div>
    </>
  );
}

export function Table({
  head,
  rows,
  cols,
}: {
  head: string[];
  rows: ReactNode[][];
  cols?: string;
}) {
  const gridCols =
    cols ??
    `2fr ${head
      .slice(1)
      .map(() => '1fr')
      .join(' ')}`;
  return (
    <>
      <div
        className="r-stack r-head"
        style={{
          display: 'grid',
          gridTemplateColumns: gridCols,
          gap: 8,
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--text-4)',
        }}
      >
        {head.map((h, i) => (
          <span key={h} style={{ textAlign: i === 0 ? 'left' : 'right' }}>
            {h}
          </span>
        ))}
      </div>
      {rows.map((r, idx) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: lignes de tableau sans id stable garanti
          key={idx}
          className="r-stack"
          style={{
            display: 'grid',
            gridTemplateColumns: gridCols,
            gap: 8,
            padding: '10px 16px',
            borderBottom: idx < rows.length - 1 ? '1px solid var(--border)' : 'none',
            fontSize: 12,
            alignItems: 'center',
          }}
        >
          {r.map((cell, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: cellules positionnelles
              key={i}
              style={{
                textAlign: i === 0 ? 'left' : 'right',
                color: i === 0 ? 'var(--text-1)' : 'var(--text-2)',
                fontWeight: i === 0 ? 600 : 400,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {cell}
            </span>
          ))}
        </div>
      ))}
    </>
  );
}

const STAGE_LABELS: Record<string, string> = {
  new: 'Nouveau',
  contacted: 'Contacté',
  meeting_booked: 'RDV pris',
  meeting_done: 'RDV fait',
  proposal_sent: 'Proposition',
  closed_won: 'Gagné',
  closed_lost: 'Perdu',
  dormant: 'Dormant',
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

export function statusLabel(s: {
  registrationComplete: boolean;
  onboardingComplete: boolean;
}): string {
  if (s.onboardingComplete) return 'Onboardé';
  if (s.registrationComplete) return 'Profil complété';
  return 'Inscrit';
}
