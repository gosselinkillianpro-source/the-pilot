import { TrendingDown, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';

/** Sparkline SVG minimaliste, trait orange + zone légère, comme sur les maquettes. */
export function Sparkline({ points, className }: { points: number[]; className?: string }) {
  const w = 120;
  const h = 40;
  if (points.length < 2) {
    return (
      <svg className={className ?? 'kpi-spark'} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" />
    );
  }
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => [i * step, h - 4 - ((p - min) / span) * (h - 8)] as const);
  const d = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
  const area = `${d} L${w},${h} L0,${h} Z`;
  return (
    <svg className={className ?? 'kpi-spark'} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={area} fill="currentColor" opacity="0.12" />
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export function KpiCard({
  label,
  value,
  delta,
  deltaLabel,
  series,
  extra,
}: {
  label: string;
  value: ReactNode;
  /** Variation en % (null = pas de base de comparaison). */
  delta?: number | null;
  deltaLabel?: string;
  series?: number[];
  extra?: ReactNode;
}) {
  const dir =
    delta === null || delta === undefined ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return (
    <div className="kpi">
      <div style={{ minWidth: 0 }}>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">
          <span className="num">{value}</span>
          {dir && (
            <span className={`kpi-delta ${dir}`} title={deltaLabel}>
              {dir === 'up' ? (
                <TrendingUp size={14} />
              ) : dir === 'down' ? (
                <TrendingDown size={14} />
              ) : null}
              {delta !== null && delta !== undefined ? `${delta > 0 ? '+' : ''}${delta} %` : ''}
            </span>
          )}
          {delta === null && deltaLabel ? (
            <span className="kpi-delta flat">{deltaLabel}</span>
          ) : null}
        </div>
        {extra ? (
          <div className="hint" style={{ marginTop: 4 }}>
            {extra}
          </div>
        ) : null}
      </div>
      {series ? <Sparkline points={series} /> : null}
    </div>
  );
}
