import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AuthError, getAuthenticatedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Espace acheteur : un seul acheteur, ses rendez-vous, rien d'autre (RLS + code). */
export default async function BuyerLayout({ children }: { children: ReactNode }) {
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof AuthError) redirect('/login/acheteur');
    throw e;
  }
  if (user.role !== 'buyer') redirect('/');
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header className="topbar" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 10 }}>
          <span
            className="sidebar-brand-mark"
            style={{ width: 32, height: 32, fontSize: 12, borderRadius: 9 }}
          >
            PL
          </span>
          <strong>Espace acheteur</strong>
        </div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn btn-ghost btn-sm">
            Se déconnecter
          </button>
        </form>
      </header>
      <main
        className="content"
        style={{ maxWidth: 1100, margin: '0 auto', background: 'transparent' }}
      >
        {children}
      </main>
    </div>
  );
}
