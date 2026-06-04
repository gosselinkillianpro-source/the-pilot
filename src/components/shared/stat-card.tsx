import { TrendingDown, TrendingUp } from 'lucide-react';
import type { Delta } from '@/lib/period';

function fmt(n: number, unit?: 'money' | 'number'): string {
  return unit === 'money'
    ? `${Math.round(n).toLocaleString('fr-FR')} €`
    : Math.round(n).toLocaleString('fr-FR');
}

/** Ligne gain/perte vs période précédente (absolu + %). À poser sous une stat. */
export function DeltaLine({ d, unit }: { d: Delta; unit?: 'money' | 'number' }) {
  // Pas de base de comparaison
  if (d.previous === 0) {
    return (
      <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
        {d.current > 0 ? 'nouveau' : '—'} · vs préc.
      </span>
    );
  }
  const up = d.deltaAbs >= 0;
  const color = d.deltaAbs === 0 ? 'var(--text-4)' : up ? 'var(--success)' : 'var(--danger)';
  return (
    <span style={{ fontSize: 11, color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {d.deltaAbs !== 0 ? up ? <TrendingUp size={12} /> : <TrendingDown size={12} /> : null}
      {up ? '+' : '−'}
      {fmt(Math.abs(d.deltaAbs), unit)}
      {d.deltaPct !== null ? ` (${d.deltaPct > 0 ? '+' : ''}${d.deltaPct} %)` : ''}
      <span style={{ color: 'var(--text-4)' }}>vs préc.</span>
    </span>
  );
}

/** Carte KPI : libellé + valeur + (gain/perte vs période précédente) ou sous-texte. */
export function StatCard({
  label,
  value,
  delta: d,
  unit,
  sub,
}: {
  label: string;
  value: string;
  delta?: Delta;
  unit?: 'money' | 'number';
  sub?: string;
}) {
  return (
    <div className="kpi-hero">
      <div className="kpi-hero-label">{label}</div>
      <div className="kpi-hero-value">{value}</div>
      <div style={{ marginTop: 4 }}>
        {d ? (
          <DeltaLine d={d} unit={unit} />
        ) : sub ? (
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{sub}</span>
        ) : null}
      </div>
    </div>
  );
}
