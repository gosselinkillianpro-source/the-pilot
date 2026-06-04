'use client';

import { useState } from 'react';

type Point = { month: string; collected: number };

const MONTHS_FR = [
  'janv',
  'févr',
  'mars',
  'avr',
  'mai',
  'juin',
  'juil',
  'août',
  'sept',
  'oct',
  'nov',
  'déc',
];

function shortMonth(ym: string): string {
  const m = Number(ym.slice(5, 7));
  return MONTHS_FR[m - 1] ?? ym;
}
function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

const W = 620;
const H = 220;
const PAD_X = 16;
const PAD_TOP = 24;
const PAD_BOTTOM = 28;

export function CollecteChart({ data }: { data: Point[] }) {
  const [range, setRange] = useState<6 | 12>(6);
  const [hover, setHover] = useState<number | null>(null);

  const pts = data.slice(-range);
  const max = Math.max(1, ...pts.map((p) => p.collected));
  const total = pts.reduce((s, p) => s + p.collected, 0);
  const n = pts.length;

  const x = (i: number) => (n <= 1 ? W / 2 : PAD_X + (i / (n - 1)) * (W - PAD_X * 2));
  const y = (v: number) => PAD_TOP + (1 - v / max) * (H - PAD_TOP - PAD_BOTTOM);

  const line = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.collected).toFixed(1)}`)
    .join(' ');
  const area = `${line} L ${x(n - 1).toFixed(1)} ${H - PAD_BOTTOM} L ${x(0).toFixed(1)} ${H - PAD_BOTTOM} Z`;

  return (
    <div className="view-card">
      <div className="view-card-header">
        <div>
          <div className="view-card-title">Collecte par mois</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
            Données réelles · {money(total)} sur la période
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {([6, 12] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`btn btn-sm ${range === r ? 'btn-primary' : 'btn-ghost'}`}
            >
              {r}M
            </button>
          ))}
        </div>
      </div>
      <div className="view-card-body">
        {n === 0 ? (
          <div style={{ padding: 20, fontSize: 13, color: 'var(--text-3)' }}>
            Aucune souscription datée (lance une synchro).
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Collecte par mois"
            style={{ width: '100%', height: 220 }}
          >
            <title>Collecte par mois</title>
            <defs>
              <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#dashGrad)" />
            <path d={line} stroke="#2563EB" strokeWidth="2" fill="none" />
            {pts.map((p, i) => (
              <g key={p.month}>
                {/* biome-ignore lint/a11y/noStaticElementInteractions: zone de survol décorative du graphique (valeur aussi lisible via les labels), aucune action au clic. */}
                <rect
                  x={x(i) - (W - PAD_X * 2) / (2 * Math.max(1, n - 1))}
                  y={0}
                  width={(W - PAD_X * 2) / Math.max(1, n - 1)}
                  height={H - PAD_BOTTOM}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: 'pointer' }}
                />
                <circle
                  cx={x(i)}
                  cy={y(p.collected)}
                  r={hover === i ? 5 : 3}
                  fill={hover === i ? '#7C3AED' : '#2563EB'}
                />
                <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--text-4)">
                  {shortMonth(p.month)}
                </text>
              </g>
            ))}
            {hover !== null && pts[hover] && (
              <g>
                <rect
                  x={Math.min(Math.max(x(hover) - 55, 2), W - 112)}
                  y={Math.max(y(pts[hover].collected) - 42, 2)}
                  width="110"
                  height="34"
                  rx="8"
                  fill="rgba(15,18,30,.92)"
                  stroke="var(--border)"
                />
                <text
                  x={Math.min(Math.max(x(hover), 57), W - 57)}
                  y={Math.max(y(pts[hover].collected) - 26, 18)}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#fff"
                  fontWeight="600"
                >
                  {money(pts[hover].collected)}
                </text>
                <text
                  x={Math.min(Math.max(x(hover), 57), W - 57)}
                  y={Math.max(y(pts[hover].collected) - 13, 30)}
                  textAnchor="middle"
                  fontSize="9"
                  fill="rgba(255,255,255,.6)"
                >
                  {shortMonth(pts[hover].month)} {pts[hover].month.slice(0, 4)}
                </text>
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
