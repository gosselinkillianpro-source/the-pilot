import Image from 'next/image';
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
            justifyContent: 'center',
            textDecoration: 'none',
          }}
        >
          <Image
            src="/brand/pilot-wordmark.png"
            alt="PILOT"
            width={140}
            height={35}
            priority
            style={{ height: 34, width: 'auto' }}
          />
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
