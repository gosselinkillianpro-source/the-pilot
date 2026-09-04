import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Page introuvable</h1>
        <p style={{ color: 'var(--text-3)' }}>
          Ce que vous cherchez n’existe pas, ou n’est pas dans votre périmètre.
        </p>
        <Link href="/" className="btn btn-primary">
          Retour à l’accueil
        </Link>
      </div>
    </div>
  );
}
