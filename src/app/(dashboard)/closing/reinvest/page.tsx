import { CalendarClock, Phone, TrendingUp, Wallet } from 'lucide-react';
import Link from 'next/link';
import { getReinvestCandidates, type ReinvestRow } from '@/lib/db/queries/reinvest';

export const dynamic = 'force-dynamic';

/**
 * Réinvestissement — capital bientôt remboursé.
 *
 * Échéance estimée = clôture de collecte + 1 an (décision Killian). Triés par
 * CAPITAL INVESTI décroissant (gros tickets d'abord), tickets < 1 000 € exclus.
 * Objectif : rappeler ~1-2 semaines avant pour enchaîner sur un nouveau placement.
 */

const HORIZON_DAYS = 60; // fenêtre d'anticipation affichée
const DISPLAY_CAP = 100; // on n'affiche que les plus prioritaires (compteurs complets)

function nb(n: number): string {
  return n.toLocaleString('fr-FR');
}
function eur(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString('fr-FR', {
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
  const list = await getReinvestCandidates(HORIZON_DAYS);

  const urgent = list.filter((r) => r.daysUntil <= 14).length;
  const soon = list.filter((r) => r.daysUntil > 14 && r.daysUntil <= 30).length;
  const potentiel = list.reduce((sum, r) => sum + r.totalInvested, 0);

  return (
    <>
      <div style={{ marginBottom: 4 }}>
        <h1 className="page-title">Réinvestissement</h1>
        <div className="page-desc">
          Capital bientôt remboursé (échéance estimée = clôture de collecte + 1 an) — à rappeler
          ~1-2 semaines avant pour réinvestir. <strong>Triés par capital investi</strong> (gros
          tickets d'abord) ; les placements de moins de 1 000 € sont écartés.
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
            Aucun capital ≥ 1 000 € à rembourser dans les {HORIZON_DAYS} prochains jours.
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-4)' }}>
              L'échéance est estimée à « clôture de collecte + 1 an » (date de clôture venue de
              Seven At Home). Si tu t'attends à en voir : lance une synchro SAH (barre du haut →
              Sync) et vérifie que les projets ont bien une date de clôture de collecte.
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
              Capital remboursé bientôt — par montant
            </div>
            <span className="badge badge-neutral">{nb(list.length)}</span>
          </div>
          <div className="view-card-body" style={{ padding: 0 }}>
            {list.slice(0, DISPLAY_CAP).map((row, idx) => (
              <ReinvestItem
                key={row.id}
                row={row}
                last={idx === Math.min(list.length, DISPLAY_CAP) - 1}
              />
            ))}
            {list.length > DISPLAY_CAP ? (
              <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-4)' }}>
                + {nb(list.length - DISPLAY_CAP)} autres (les {DISPLAY_CAP} plus gros capitaux sont
                affichés).
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

function ReinvestItem({ row, last }: { row: ReinvestRow; last: boolean }) {
  const b = echeanceBadge(row.daysUntil);
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
      {/* Capital = critère n°1, mis en avant à gauche */}
      <div style={{ minWidth: 96, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>
          {eur(row.totalInvested)}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-4)' }}>investi</span>
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <Link
          href={`/closing/investor/${row.id}?from=${encodeURIComponent('/closing/reinvest')}`}
          style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand)', textDecoration: 'none' }}
        >
          {row.fullName ?? row.email}
        </Link>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
          Remboursement estimé ~ {fmtDate(row.nextRepayment)}
          {row.city ? ` · ${row.city}` : ''}
          {row.isBreach ? ' · BREACH' : ''}
        </div>
      </div>

      <span className={`badge ${b.cls}`} style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
        {b.label}
      </span>

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
