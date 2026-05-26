import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 relative">
      <div className="flex flex-col items-center text-center" style={{ maxWidth: 640, gap: 28 }}>
        <div
          className="inline-flex items-center liquid"
          style={{
            gap: 8,
            padding: '6px 14px',
            borderRadius: 9999,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: 'var(--text-2)',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--success)',
              boxShadow: '0 0 12px var(--success-glow)',
            }}
          />
          THE PILOT · v0 scaffold
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: 'clamp(56px, 9vw, 112px)',
            lineHeight: 0.92,
            letterSpacing: '-0.035em',
            background: 'linear-gradient(135deg, #0A0E1A 0%, #2563EB 50%, #7C3AED 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 4px 32px rgba(124, 58, 237, 0.12))',
            margin: 0,
          }}
        >
          Pilote ton
          <br />
          marketing.
        </h1>

        <p
          style={{
            fontSize: '1rem',
            color: 'var(--text-2)',
            lineHeight: 1.65,
            maxWidth: 560,
            margin: 0,
          }}
        >
          Quand tu pilotes un avion, tu regardes l'horizon. THE PILOT, c'est pareil. Un horizon
          abstrait qui apaise, un contenu épuré qui guide, juste ce qu'il faut de magie pour rendre
          l'app inoubliable.
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginTop: 4,
          }}
        >
          <Link
            href="/dashboard"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 40,
              padding: '0 18px',
              borderRadius: 8,
              background: 'var(--brand)',
              color: '#FFFFFF',
              fontSize: '0.875rem',
              fontWeight: 500,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 14px rgba(37, 99, 235, 0.22)',
              transition: 'all 180ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            Ouvrir le dashboard
          </Link>
          <Link
            href="/"
            className="liquid"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 40,
              padding: '0 18px',
              borderRadius: 8,
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--text-1)',
            }}
          >
            Documentation
          </Link>
        </div>
      </div>
    </main>
  );
}
