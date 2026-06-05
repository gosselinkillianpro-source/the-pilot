import {
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  LayoutGrid,
  Mail,
  Search,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SidebarLink } from '@/components/shared/sidebar-nav';
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

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser();
  const { name, initials } = deriveDisplay(user.email);
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
            <kbd>⌘K</kbd>
          </div>

          <div className="view-sidebar-section">
            <div className="view-sidebar-section-title">Workspace</div>
            <SidebarLink href="/dashboard" exact>
              <LayoutGrid />
              Vue d'ensemble
            </SidebarLink>
            <SidebarLink href="/closing">
              <Users />
              Closing
            </SidebarLink>
            <SidebarLink href="/projects">
              <Building2 />
              Projets
            </SidebarLink>
            <SidebarLink href="/breach" style={{ color: 'var(--ai)' }}>
              <Target />
              BREACH
            </SidebarLink>
            <SidebarLink href="/email">
              <Mail />
              Email
            </SidebarLink>
            <SidebarLink href="/social">
              <Share2 />
              Social
            </SidebarLink>
            <SidebarLink href="/ads">
              <TrendingUp />
              Ads
            </SidebarLink>
            <SidebarLink href="/performance">
              <BarChart3 />
              Performance
            </SidebarLink>
          </div>

          <div className="view-sidebar-section">
            <div className="view-sidebar-section-title">IA</div>
            <SidebarLink href="/brain" style={{ color: 'var(--ai)' }}>
              <Sparkles />
              Pilot Brain
            </SidebarLink>
          </div>

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
            <div className="view-topbar-breadcrumb">
              <span className="crumb">Workspace</span>
              <ChevronDown size={12} style={{ transform: 'rotate(-90deg)' }} />
              <span className="crumb active">THE PILOT</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="view-topbar-search">
                <Search size={14} />
                <span style={{ flex: 1 }}>Rechercher</span>
                <kbd>⌘K</kbd>
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
                <Bell size={14} />
                <span
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 6,
                    height: 6,
                    background: 'var(--danger)',
                    borderRadius: '50%',
                    boxShadow: '0 0 8px var(--danger-glow)',
                  }}
                />
              </button>
            </div>
          </div>

          <main className="app-main">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
