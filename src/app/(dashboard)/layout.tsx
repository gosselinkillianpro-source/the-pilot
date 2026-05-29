import {
  BarChart3,
  Bell,
  ChevronDown,
  LayoutGrid,
  Mail,
  Search,
  Share2,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SidebarLink } from '@/components/shared/sidebar-nav';
import { UserMenu } from '@/components/shared/user-menu';
import { getAuthenticatedUser } from '@/lib/auth';

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
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '220px 1fr',
        minHeight: '100vh',
        position: 'relative',
        zIndex: 1,
      }}
    >
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
          <SidebarLink href="/closing/pipeline">
            <Users />
            Closing
            <span className="view-sidebar-link-badge">14</span>
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

        <main
          style={{
            flex: 1,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            overflowY: 'auto',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
