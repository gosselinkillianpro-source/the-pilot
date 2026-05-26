import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-xl text-center space-y-4">
        <h1 className="text-4xl font-bold">THE PILOT</h1>
        <p className="text-muted-foreground">Cabine de pilotage marketing 360 — Seven At Home.</p>
        <Link
          href="/closing/pipeline"
          className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90"
        >
          Ouvrir le dashboard
        </Link>
      </div>
    </main>
  );
}
