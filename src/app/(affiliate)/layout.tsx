import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AffiliateNav } from '@/components/affiliate/nav';
import { ToastProvider } from '@/components/shared/toast';
import { UserMenu } from '@/components/shared/user-menu';
import { getAuthenticatedUser } from '@/lib/auth';
import { isAuthDisabled } from '@/lib/auth/dev-bypass';

function deriveDisplay(email: string): { name: string; initials: string } {
  const local = email.split('@')[0] ?? 'utilisateur';
  const parts = local.split(/[._-]+/).filter(Boolean);
  const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  const initials = (parts[0]?.[0] ?? local[0] ?? '?').concat(parts[1]?.[0] ?? '').toUpperCase();
  return { name: name || local, initials };
}

/**
 * Espace "admin affilié" — séparé du dashboard staff. SEULS y accèdent :
 * - `admin_affiliate` (l'affilié, qui ne voit que SON réseau)
 * - `admin` (support / vérification interne)
 * Tout autre rôle est renvoyé au dashboard. Défense en profondeur : les pages
 * scopent en plus chaque requête au sous-réseau (owner_sah_id).
 */
export default async function AffiliateLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser();
  if (user.role !== 'admin_affiliate' && user.role !== 'admin') {
    redirect('/dashboard');
  }
  const { name, initials } = deriveDisplay(user.email);

  return (
    <ToastProvider>
      <div className="app-shell">
        <aside className="view-sidebar">
          <Link href="/reseau" className="view-sidebar-brand">
            <Image
              src="/brand/pilot-logo-wordmark.png"
              alt="PILOT"
              width={112}
              height={28}
              priority
              style={{ height: 26, width: 'auto' }}
            />
          </Link>

          <AffiliateNav />

          <UserMenu name={name} role={user.role} initials={initials} />
        </aside>

        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
          {isAuthDisabled() && (
            <div
              style={{
                background: 'var(--danger)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'center',
                padding: '6px 12px',
              }}
            >
              🔓 Authentification DÉSACTIVÉE (dev local) — à RÉACTIVER avant la mise en ligne
            </div>
          )}
          <main className="app-main">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
