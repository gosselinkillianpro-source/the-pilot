import {
  BarChart3,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronsUpDown,
  LayoutGrid,
  PhoneCall,
  Radio,
  Search,
  Users,
  UsersRound,
} from 'lucide-react';
import type { AuthenticatedUser } from '@/lib/auth';
import { SidebarLink } from './sidebar-link';
import { UserCard } from './user-card';

export function Sidebar({
  user,
  sourceName,
  queueCount,
  className,
}: {
  user: AuthenticatedUser;
  sourceName: string;
  queueCount: number;
  className?: string;
}) {
  return (
    <aside className={`sidebar${className ? ` ${className}` : ''}`}>
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark">PL</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="sidebar-brand-name">The Pilot Lead</div>
          <div className="sidebar-brand-sub">{sourceName}</div>
        </div>
        <ChevronsUpDown size={16} color="var(--text-3)" />
      </div>

      <form action="/leads" method="get" className="sidebar-search">
        <Search size={16} />
        <input name="q" placeholder="Rechercher un lead" aria-label="Rechercher un lead" />
        <kbd>/</kbd>
      </form>

      <div className="sidebar-section">
        <div className="sidebar-section-title">
          <ChevronDown /> Opérations
        </div>
        <SidebarLink href="/" exact>
          <LayoutGrid /> Vue d’ensemble
        </SidebarLink>
        <SidebarLink href="/a-rappeler" badge={queueCount} hot>
          <PhoneCall /> À rappeler
        </SidebarLink>
        <SidebarLink href="/leads">
          <Users /> Leads
        </SidebarLink>
        <SidebarLink href="/rendez-vous">
          <CalendarClock /> Rendez-vous
        </SidebarLink>
        <SidebarLink href="/acheteurs">
          <Building2 /> Acheteurs
        </SidebarLink>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">
          <ChevronDown /> Pilotage
        </div>
        <SidebarLink href="/tableau">
          <BarChart3 /> Tableau du lundi
        </SidebarLink>
      </div>

      {user.role === 'admin' ? (
        <div className="sidebar-section">
          <div className="sidebar-section-title">
            <ChevronDown /> Réglages
          </div>
          <SidebarLink href="/sources">
            <Radio /> Sources
          </SidebarLink>
          <SidebarLink href="/utilisateurs">
            <UsersRound /> Utilisateurs
          </SidebarLink>
        </div>
      ) : null}

      <UserCard user={user} />
    </aside>
  );
}
