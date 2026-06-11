import { Compass } from 'lucide-react';
import Link from 'next/link';

/** 404 au style Horizon (au lieu de la page Next.js brute). */
export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div className="view-card" style={{ maxWidth: 460, width: '100%' }}>
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
              background: 'var(--brand-bg)',
              color: 'var(--brand)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Compass size={20} />
          </span>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>
            Page introuvable
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>
            Cette page n'existe pas (ou plus). Le dashboard, lui, est toujours là.
          </div>
          <Link href="/dashboard" className="btn btn-primary">
            Retour au dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
