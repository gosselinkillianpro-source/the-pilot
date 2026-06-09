import {
  Activity,
  BarChart3,
  Building2,
  LayoutGrid,
  Mail,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { SidebarLink } from '@/components/shared/sidebar-nav';

/**
 * Contenu de navigation principal, partagé entre la barre latérale (desktop)
 * et le drawer (mobile). Pas de hook ici → utilisable côté serveur et client.
 */
export function NavContent({ role }: { role: string }) {
  return (
    <>
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
        {role === 'admin' && (
          <SidebarLink href="/equipe">
            <Activity />
            Équipe
          </SidebarLink>
        )}
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
    </>
  );
}
