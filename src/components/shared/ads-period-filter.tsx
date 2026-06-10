'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ADS_PERIODS } from '@/lib/ads/period';

/** Filtre de temporalité des Ads : préréglages natifs Meta/Google + plage personnalisée. */
export function AdsPeriodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const hasCustom = !!(params.get('from') && params.get('to'));
  const activePreset = params.get('period') ?? 'this_month';
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');

  function go(next: URLSearchParams) {
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function selectPreset(key: string) {
    const next = new URLSearchParams(params.toString());
    next.delete('from');
    next.delete('to');
    next.set('period', key);
    go(next);
  }

  function applyCustom() {
    if (!from || !to) return;
    const next = new URLSearchParams(params.toString());
    next.delete('period');
    next.set('from', from);
    next.set('to', to);
    go(next);
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {ADS_PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => selectPreset(p.key)}
            className={`btn btn-sm ${!hasCustom && activePreset === p.key ? 'btn-primary' : 'btn-secondary'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          type="date"
          className="input"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          style={{ height: 30, fontSize: 12, padding: '0 8px' }}
          aria-label="Date de début"
        />
        <span style={{ color: 'var(--text-4)', fontSize: 12 }}>→</span>
        <input
          type="date"
          className="input"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          style={{ height: 30, fontSize: 12, padding: '0 8px' }}
          aria-label="Date de fin"
        />
        <button
          type="button"
          onClick={applyCustom}
          disabled={!from || !to}
          className={`btn btn-sm ${hasCustom ? 'btn-primary' : 'btn-secondary'}`}
        >
          Appliquer
        </button>
      </div>
    </div>
  );
}
