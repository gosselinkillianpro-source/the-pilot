import { CalendarClock, Phone, TrendingUp, Wallet } from 'lucide-react';
import Link from 'next/link';
import { getCallQueue, type QueueRow } from '@/lib/db/queries/call-queue';

export const dynamic = 'force-dynamic';

/**
 * Réinvestissement — capital bientôt remboursé.
 *
 * Liste dédiée des investisseurs dont un projet arrive à échéance de remboursement
 * dans les prochains jours : on les rappelle AVANT que le capital revienne pour
 * enchaîner sur un nouveau placement (« le moment roi »). Réutilise le moteur de
 * scoring (QueueRow.scored.nearestRepaymentDays) — aucune donnée nouvelle.
 *
 * Pourquoi un onglet à part : dans la file d'appels, cette population est noyée
 * (4ᵉ file de l'accordéon, masquée par le filtre « BREACH » par défaut). Ici on la
 * voit toute, tous codes confondus, triée par échéance la plus proche.
 */

const HORIZON_DAYS = 60; // fenêtre d'anticipation affichée
const DISPLAY_CAP = 100; // on n'affiche que les plus proches (les compteurs restent complets)

function nb(n: number): string {
  return n.toLocaleString('fr-FR');
}

function eur(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

/** Date approximative de remboursement = aujourd'hui + J restants (les jours sont déjà arrondis). */
function repaymentDate(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function echeanceBadge(days: number): { label: string; cls: string } {
  if (days <= 14) return { label: `J-${days} · à appeler maintenant`, cls: 'badge-danger' };
  if (days <= 30) return { label: `J-${days}`, cls: 'badge-warning' };
  return { label: `J-${days}`, cls: 'badge-neutral' };
}

export default async function ReinvestPage() {
  const queue = await getCallQueue({ excludeWon: true });

  const list = queue
    .filter((r) => {
      const d = r.scored.nearestRepaymentDays;
      return d != null && d >= 0 && d <= HORIZON_DAYS;
    })
    .sort((a, b) => (a.scored.nearestRepaymentDays ?? 0) - (b.scored.nearestRepaymentDays ?? 0));

  const urgent = list.filter((r) => (r.scored.nearestRepaymentDays ?? 99) <= 14).length;
  const soon = list.filter((r) => {
    const d = r.scored.nearestRepaymentDays ?? 99;
    return d > 14 && d <= 30;
  }).length;
  const potentiel = list.reduce((sum, r) => sum + r.totalInvested, 0);

  return (
    <>
      <div style={{ marginBottom: 4 }}>
        <h1 className="page-title">Réinvestissement</h1>
        <div className="page-desc">
          Les investisseurs dont le capital est bientôt remboursé — à rappeler ~1 à 2 semaines avant
          l'échéance pour enchaîner sur un nouveau placement. Triés par échéance la plus proche,
          tous codes confondus.
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <Kpi
          icon={<CalendarClock size={15} />}
          label="À appeler maintenant (≤14 j)"
          value={nb(urgent)}
          accent="var(--danger)"
        />
        <Kpi
          icon={<CalendarClock size={15} />}
          label="Cette quinzaine (15-30 j)"
          value={nb(soon)}
          accent="var(--warning)"
        />
        <Kpi
          icon={<Wallet size={15} />}
          label={`Échéances ≤${HORIZON_DAYS} j`}
          value={nb(list.length)}
          accent="var(--brand)"
        />
        <Kpi
          icon={<TrendingUp size={15} />}
          label="Capital à replacer"
          value={eur(potentiel)}
          accent="var(--success)"
        />
      </div>

      {list.length === 0 ? (
        <div className="view-card">
          <div
            className="view-card-body"
            style={{ padding: 24, fontSize: 13, color: 'var(--text-3)' }}
          >
            Aucune échéance de remboursement dans les {HORIZON_DAYS} prochains jours.
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-4)' }}>
              Ces dates viennent de Seven At Home (échéance réelle du projet). Si tu t'attends à en
              voir : lance une synchro SAH (barre du haut → Sync), et vérifie que les projets ont
              bien une date de remboursement renseignée.
            </div>
          </div>
        </div>
      ) : (
        <div className="view-card">
          <div className="view-card-header">
            <div
              className="view-card-title"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <CalendarClock size={15} />
              Capital remboursé bientôt
            </div>
            <span className="badge badge-neutral">{nb(list.length)}</span>
          </div>
          <div className="view-card-body" style={{ padding: 0 }}>
            {list.slice(0, DISPLAY_CAP).map((row, idx) => (
              <ReinvestRow
                key={row.id}
                row={row}
                last={idx === Math.min(list.length, DISPLAY_CAP) - 1}
              />
            ))}
            {list.length > DISPLAY_CAP ? (
              <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-4)' }}>
                + {nb(list.length - DISPLAY_CAP)} autres échéances plus lointaines (les{' '}
                {DISPLAY_CAP} plus proches sont affichées).
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

function ReinvestRow({ row, last }: { row: QueueRow; last: boolean }) {
  const days = row.scored.nearestRepaymentDays ?? 0;
  const b = echeanceBadge(days);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        flexWrap: 'wrap',
      }}
    >
      <span className={`badge ${b.cls}`} style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
        {b.label}
      </span>

      <div style={{ minWidth: 0, flex: 1 }}>
        <Link
          href={`/closing/investor/${row.id}?from=${encodeURIComponent('/closing/reinvest')}`}
          style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand)', textDecoration: 'none' }}
        >
          {row.fullName ?? row.email}
        </Link>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
          Remboursement ~ {repaymentDate(days)}
          {row.city ? ` · ${row.city}` : ''}
          {row.isBreach ? ' · BREACH' : ''}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
          {eur(row.totalInvested)}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-4)' }}>investi</span>
      </div>

      {row.phone ? (
        <a href={`tel:${row.phone}`} className="btn btn-primary btn-sm" aria-label="Appeler">
          <Phone size={13} />
        </a>
      ) : null}
    </div>
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
