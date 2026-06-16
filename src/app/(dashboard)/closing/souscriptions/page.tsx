import Link from 'next/link';
import {
  getSubscriptionsList,
  type SubRow,
  type SubScope,
  type SubStatus,
} from '@/lib/db/queries/subscriptions';

export const dynamic = 'force-dynamic';

const SCOPES: { value: SubScope; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'breach', label: 'BREACH (mes pubs)' },
];

const LIMITS = [60, 200, 1000];

function eur(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const STATUS_META: Record<SubStatus, { label: string; cls: string }> = {
  paid: { label: 'Payée', cls: 'badge-success' },
  active: { label: 'Active', cls: 'badge-success' },
  repaid: { label: 'Remboursée', cls: 'badge-success' },
  signed: { label: 'Signée', cls: 'badge-neutral' },
  cancelled: { label: 'Annulée', cls: 'badge-danger' },
};

/** Date la plus pertinente selon le statut. */
function rowDate(r: SubRow): { date: Date | null; label: string } {
  if (r.status === 'cancelled') return { date: r.canceledAt, label: 'annulée' };
  if (r.paidAt) return { date: r.paidAt, label: 'payée' };
  return { date: r.signedAt, label: 'signée' };
}

const th: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 10.5,
  fontWeight: 600,
  color: 'var(--text-3)',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  padding: '6px 10px',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
};

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="view-card">
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</span>
        <span style={{ fontSize: 24, fontWeight: 700, color: accent ?? 'var(--text-1)' }}>
          {value}
        </span>
        {hint ? <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{hint}</span> : null}
      </div>
    </div>
  );
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; limit?: string }>;
}) {
  const sp = await searchParams;
  const scope: SubScope = sp.scope === 'breach' ? 'breach' : 'all';
  const limit = LIMITS.includes(Number(sp.limit)) ? Number(sp.limit) : 60;

  const { rows, totals, hasMore } = await getSubscriptionsList({ scope, limit });
  const qs = (next: Partial<{ scope: SubScope; limit: number }>) => {
    const s = next.scope ?? scope;
    const l = next.limit ?? limit;
    return `/closing/souscriptions?scope=${s}${l !== 60 ? `&limit=${l}` : ''}`;
  };
  const nextLimit = LIMITS.find((l) => l > limit) ?? null;

  return (
    <>
      <div>
        <h1 className="page-title">Souscriptions</h1>
        <div className="page-desc">
          Toutes les souscriptions (miroir Seven At Home). Le total collecté compte les
          souscriptions <strong>payées et signées</strong> ; les <strong>annulées</strong> sont
          affichées mais exclues du total.
        </div>
      </div>

      {/* Filtre périmètre */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
        {SCOPES.map((s) => {
          const active = s.value === scope;
          return (
            <Link
              key={s.value}
              href={qs({ scope: s.value, limit: 60 })}
              style={{
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                color: active ? 'var(--text-1)' : 'var(--text-3)',
                borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
                marginBottom: -1,
                textDecoration: 'none',
              }}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      {/* KPIs */}
      <div
        className="kpi-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 10,
        }}
      >
        <Kpi
          label="Collecte (payées + signées)"
          value={eur(totals.collecte)}
          hint={`${totals.count.toLocaleString('fr-FR')} souscriptions`}
          accent="var(--success)"
        />
        <Kpi label="Ticket moyen / investisseur" value={eur(totals.avgTicket)} />
        <Kpi
          label="Annulées (exclues)"
          value={eur(totals.cancelledAmount)}
          hint={`${totals.cancelledCount.toLocaleString('fr-FR')} souscriptions`}
          accent="var(--danger)"
        />
      </div>

      {/* Liste */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Dernières souscriptions</div>
          <span style={{ fontSize: 12, color: 'var(--text-4)' }}>
            {rows.length.toLocaleString('fr-FR')} affichées{hasMore ? ' (plus disponibles)' : ''}
          </span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          <div className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Investisseur</th>
                  <th style={th}>Projet</th>
                  <th style={{ ...th, textAlign: 'right' }}>Montant</th>
                  <th style={th}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 20, color: 'var(--text-3)', fontSize: 13 }}>
                      Aucune souscription.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const meta = STATUS_META[r.status];
                    const dt = rowDate(r);
                    const cancelled = r.status === 'cancelled';
                    return (
                      <tr key={r.id}>
                        <td style={cell()}>
                          <span style={{ color: 'var(--text-2)' }}>{fmtDate(dt.date)}</span>
                          <span style={{ color: 'var(--text-4)', fontSize: 11, marginLeft: 5 }}>
                            {dt.label}
                          </span>
                        </td>
                        <td style={cell()}>
                          <Link
                            href={`/closing/investor/${r.investorId}?from=${encodeURIComponent('/closing/souscriptions')}`}
                            style={{
                              color: 'var(--text-1)',
                              fontWeight: 500,
                              textDecoration: 'none',
                            }}
                          >
                            {r.investorName ?? '—'}
                          </Link>
                          {r.isBreach ? (
                            <span
                              className="badge"
                              style={{
                                fontSize: 9,
                                marginLeft: 6,
                                background: 'var(--ai-bg, #ede9fe)',
                                color: 'var(--ai, #7c3aed)',
                                fontWeight: 700,
                              }}
                              title={r.bonusCode ?? 'BREACH'}
                            >
                              BREACH
                            </span>
                          ) : null}
                        </td>
                        <td style={{ ...cell(), color: 'var(--text-3)' }}>
                          {r.projectName ?? '—'}
                        </td>
                        <td
                          style={{
                            ...cell(),
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                            color: cancelled ? 'var(--text-4)' : 'var(--text-1)',
                            textDecoration: cancelled ? 'line-through' : 'none',
                          }}
                        >
                          {eur(r.amount)}
                        </td>
                        <td style={cell()}>
                          <span className={`badge ${meta.cls}`} style={{ fontSize: 10 }}>
                            {meta.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {hasMore && nextLimit ? (
            <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
              <Link href={qs({ limit: nextLimit })} className="btn btn-secondary btn-sm">
                Afficher plus ({nextLimit.toLocaleString('fr-FR')})
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function cell(): React.CSSProperties {
  return {
    padding: '9px 10px',
    borderBottom: '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
    fontSize: 13,
    whiteSpace: 'nowrap',
  };
}
