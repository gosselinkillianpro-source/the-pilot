import { sql } from 'drizzle-orm';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AffiliateMobileNav } from '@/components/affiliate/mobile-nav';
import { AffiliateNav } from '@/components/affiliate/nav';
import { ToastProvider } from '@/components/shared/toast';
import { UserMenu } from '@/components/shared/user-menu';
import { getAuthenticatedUser } from '@/lib/auth';
import { isAuthDisabled } from '@/lib/auth/dev-bypass';
import { db } from '@/lib/db';
import { investors } from '@/lib/db/schema';

function deriveDisplay(email: string): { name: string; initials: string } {
  const local = email.split('@')[0] ?? 'utilisateur';
  const parts = local.split(/[._-]+/).filter(Boolean);
  const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  const initials = (parts[0]?.[0] ?? local[0] ?? '?').concat(parts[1]?.[0] ?? '').toUpperCase();
  return { name: name || local, initials };
}

/** Fraîcheur des données (proxy : max(updated_at) des investisseurs), comme côté staff. */
async function getLastSyncAt(): Promise<Date | null> {
  try {
    const rows = await db
      .select({ last: sql<string | null>`max(${investors.updatedAt})` })
      .from(investors);
    const v = rows[0]?.last;
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}

function formatAgo(d: Date | null): string | null {
  if (!d) return null;
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
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
  const lastSync = await getLastSyncAt();
  const freshness = formatAgo(lastSync);
  const freshOk = lastSync ? Date.now() - lastSync.getTime() < 2 * 3600 * 1000 : false;

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

          <div className="view-topbar">
            <AffiliateMobileNav role={user.role} name={name} initials={initials} />
            <div className="view-topbar-breadcrumb">
              <span className="crumb active">Espace affilié</span>
            </div>
            {freshness && (
              <div
                title="Dernière mise à jour des données depuis Seven At Home"
                style={{
                  marginLeft: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  color: 'var(--text-3)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: freshOk ? 'var(--success)' : 'var(--warning)',
                    boxShadow: `0 0 6px ${freshOk ? 'var(--success)' : 'var(--warning)'}`,
                    flexShrink: 0,
                  }}
                />
                Données {freshness}
              </div>
            )}
          </div>

          <main className="app-main">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
