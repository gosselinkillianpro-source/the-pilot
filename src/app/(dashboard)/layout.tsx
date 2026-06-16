import { sql } from 'drizzle-orm';
import { Bell, ChevronDown, Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { MobileNav } from '@/components/shared/mobile-nav';
import { NavContent } from '@/components/shared/nav-content';
import { SyncButton } from '@/components/shared/sync-button';
import { ToastProvider } from '@/components/shared/toast';
import { UserMenu } from '@/components/shared/user-menu';
import { getAuthenticatedUser } from '@/lib/auth';
import { isAuthDisabled } from '@/lib/auth/dev-bypass';
import { db } from '@/lib/db';
import { touchLastSeen } from '@/lib/db/queries/users';
import { investors } from '@/lib/db/schema';

function deriveDisplay(email: string): { name: string; initials: string } {
  const local = email.split('@')[0] ?? 'utilisateur';
  const parts = local.split(/[._-]+/).filter(Boolean);
  const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  const initials = (parts[0]?.[0] ?? local[0] ?? '?').concat(parts[1]?.[0] ?? '').toUpperCase();
  return { name: name || local, initials };
}

/** Date de dernière écriture de la sync SAH (proxy : max(updated_at) des investisseurs). */
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

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser();
  await touchLastSeen(user.id); // « vu à l'instant » (présence du menu Équipe) — throttlé + best-effort
  const { name, initials } = deriveDisplay(user.email);
  const lastSync = await getLastSyncAt();
  const freshness = formatAgo(lastSync);
  const freshOk = lastSync ? Date.now() - lastSync.getTime() < 2 * 3600 * 1000 : false;
  return (
    <ToastProvider>
      <div className="app-shell">
        <aside className="view-sidebar">
          <Link href="/" className="view-sidebar-brand">
            <Image
              src="/brand/pilot-logo-wordmark.png"
              alt="PILOT"
              width={112}
              height={28}
              priority
              style={{ height: 26, width: 'auto' }}
            />
          </Link>

          <div className="view-topbar-search" style={{ width: '100%', minWidth: 0 }}>
            <Search size={14} />
            <span style={{ flex: 1 }}>Recherche</span>
            <kbd>Ctrl K</kbd>
          </div>

          <NavContent role={user.role} />

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
                letterSpacing: '0.02em',
              }}
            >
              🔓 Authentification DÉSACTIVÉE (dev local) — à RÉACTIVER avant la mise en ligne
              (retirer DISABLE_AUTH de .env.local)
            </div>
          )}
          <div className="view-topbar">
            <MobileNav role={user.role} name={name} initials={initials} />
            <div className="view-topbar-breadcrumb">
              <span className="crumb">Workspace</span>
              <ChevronDown size={12} style={{ transform: 'rotate(-90deg)' }} />
              <span className="crumb active">THE PILOT</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {freshness && (
                <div
                  title="Dernière mise à jour des données depuis Seven At Home"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    color: 'var(--text-3)',
                    padding: '0 8px',
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
              <SyncButton />
              <div className="view-topbar-search">
                <Search size={14} />
                <span style={{ flex: 1 }}>Rechercher</span>
                <kbd>Ctrl K</kbd>
              </div>
              <button
                type="button"
                aria-label="Notifications"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'var(--glass-bg-strong)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  cursor: 'pointer',
                }}
              >
                {/* Point rouge retiré : il était codé en dur (fausse notification permanente).
                    Il reviendra branché sur de vraies données (centre de notifications). */}
                <Bell size={14} />
              </button>
            </div>
          </div>

          <main className="app-main">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
