import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        position: 'relative',
        zIndex: 1,
      }}
    >
      <div
        style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 24 }}
      >
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: 'var(--brand)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1rem',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 14px rgba(37, 99, 235, 0.22)',
            }}
          >
            P
          </div>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-1)' }}>
            THE PILOT
          </span>
        </Link>

        <div className="view-card" style={{ padding: 28 }}>
          {children}
        </div>

        <p
          style={{
            textAlign: 'center',
            fontSize: '0.6875rem',
            color: 'var(--text-4)',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Outil interne Seven At Home · accès restreint
        </p>
      </div>
    </main>
  );
}
