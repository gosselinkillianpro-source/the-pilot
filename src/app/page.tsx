import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 relative">
      <div className="max-w-2xl text-center space-y-8">
        <div
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full liquid border"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: 'var(--text-2)',
          }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{
              background: 'var(--success)',
              boxShadow: '0 0 12px var(--success-glow)',
            }}
          />
          THE PILOT · v0 scaffold
        </div>

        <h1
          className="font-display italic"
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
            margin: '0 auto',
          }}
        >
          Quand tu pilotes un avion, tu regardes l'horizon. THE PILOT, c'est pareil. Un horizon
          abstrait qui apaise, un contenu épuré qui guide, juste ce qu'il faut de magie pour rendre
          l'app inoubliable.
        </p>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/closing/pipeline"
            className="inline-flex items-center gap-2 px-4 h-10 rounded-md text-white text-sm font-medium transition-all"
            style={{
              background: 'var(--brand)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 14px rgba(37, 99, 235, 0.22)',
            }}
          >
            Ouvrir le dashboard
          </Link>
          <a
            href="https://github.com"
            className="inline-flex items-center gap-2 px-4 h-10 rounded-md text-sm font-medium liquid"
            style={{ color: 'var(--text-1)' }}
          >
            Documentation
          </a>
        </div>
      </div>
    </main>
  );
}
