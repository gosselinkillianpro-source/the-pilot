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
import Link from 'next/link';
import type { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
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
        <Link href="/" className="view-sidebar-brand" style={{ textDecoration: 'none' }}>
          <div className="view-sidebar-brand-mark">P</div>
          <div className="view-sidebar-brand-name" style={{ color: 'var(--text-1)' }}>
            THE PILOT
          </div>
        </Link>

        <div className="view-topbar-search" style={{ width: '100%', minWidth: 0 }}>
          <Search size={14} />
          <span style={{ flex: 1 }}>Recherche</span>
          <kbd>⌘K</kbd>
        </div>

        <div className="view-sidebar-section">
          <div className="view-sidebar-section-title">Workspace</div>
          <Link href="/" className="view-sidebar-link">
            <LayoutGrid />
            Vue d'ensemble
          </Link>
          <Link href="/closing/pipeline" className="view-sidebar-link active">
            <Users />
            Closing
            <span className="view-sidebar-link-badge">14</span>
          </Link>
          <Link href="/email/flows" className="view-sidebar-link">
            <Mail />
            Email
          </Link>
          <Link href="/social" className="view-sidebar-link">
            <Share2 />
            Social
          </Link>
          <Link href="/ads" className="view-sidebar-link">
            <TrendingUp />
            Ads
          </Link>
          <Link href="/performance" className="view-sidebar-link">
            <BarChart3 />
            Performance
          </Link>
        </div>

        <div className="view-sidebar-section">
          <div className="view-sidebar-section-title">IA</div>
          <Link href="/brain" className="view-sidebar-link" style={{ color: 'var(--ai)' }}>
            <Sparkles />
            Pilot Brain
          </Link>
        </div>

        <div className="view-sidebar-user">
          <div className="avatar avatar-sm avatar-blue avatar-status">KL</div>
          <div className="view-sidebar-user-info">
            <div className="view-sidebar-user-name">Killian</div>
            <div className="view-sidebar-user-role">Admin</div>
          </div>
          <ChevronDown size={14} style={{ color: 'var(--text-3)' }} />
        </div>
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
        <div className="view-topbar">
          <div className="view-topbar-breadcrumb">
            <span className="crumb">Workspace</span>
            <ChevronDown size={12} style={{ transform: 'rotate(-90deg)' }} />
            <span className="crumb active">Closing</span>
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
