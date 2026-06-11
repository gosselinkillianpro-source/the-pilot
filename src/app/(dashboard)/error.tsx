'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import Link from 'next/link';

/** Écran d'erreur au style Horizon (au lieu de la page Next.js brute). */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="view-card" style={{ maxWidth: 520, margin: '48px auto', width: '100%' }}>
      <div
        className="view-card-body"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          textAlign: 'center',
          padding: '36px 28px',
        }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AlertTriangle size={20} />
        </span>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>
          Une erreur est survenue
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>
          La page n'a pas pu se charger. Réessaie — si ça persiste, signale-le à Killian.
          {error.digest ? (
            <span
              style={{
                display: 'block',
                marginTop: 6,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-4)',
              }}
            >
              Réf. {error.digest}
            </span>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={reset}>
            <RotateCcw size={14} />
            Réessayer
          </button>
          <Link href="/dashboard" className="btn btn-secondary">
            Retour au dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
