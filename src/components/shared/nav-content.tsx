import {
  Activity,
  BarChart3,
  BellRing,
  Building2,
  CalendarClock,
  KanbanSquare,
  LayoutGrid,
  Mail,
  Radio,
  Target,
  TrendingUp,
  Trophy,
  UserSquare2,
  Users,
} from 'lucide-react';
import { SidebarLink } from '@/components/shared/sidebar-nav';

/**
 * Contenu de navigation principal, partagé entre la barre latérale (desktop)
 * et le drawer (mobile). Pas de hook ici → utilisable côté serveur et client.
 *
 * Refonte du 4 sept. 2026 : un closer n'a que son poste (Aujourd'hui, Mes
 * clients, Mes résultats), l'agenda s'il a relié son Calendly, ses alertes,
 * et les projets en référence. Tout le pilotage reste à l'admin.
 */
export function NavContent({ role, hasCalendly = false }: { role: string; hasCalendly?: boolean }) {
  const isCloser = role === 'closer' || role === 'closer_junior';
  if (isCloser) {
    return (
      <>
        <div className="view-sidebar-section">
          <div className="view-sidebar-section-title">Mon poste</div>
          <SidebarLink href="/closing/aujourdhui">
            <CalendarClock />
            Aujourd'hui
          </SidebarLink>
          <SidebarLink href="/closing/clients">
            <UserSquare2 />
            Mes clients
          </SidebarLink>
          <SidebarLink href="/closing/resultats">
            <Trophy />
            Mes résultats
          </SidebarLink>
          {hasCalendly && (
            <SidebarLink href="/rdv">
              <CalendarClock />
              Rendez-vous
            </SidebarLink>
          )}
        </div>
        <div className="view-sidebar-section">
          <div className="view-sidebar-section-title">Référence</div>
          <SidebarLink href="/projects">
            <Building2 />
            Projets
          </SidebarLink>
          <SidebarLink href="/alertes">
            <BellRing />
            Mes alertes
          </SidebarLink>
        </div>
      </>
    );
  }

  return (
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
      <SidebarLink href="/closing/pipeline">
        <KanbanSquare />
        Suivi des appels
      </SidebarLink>
      <SidebarLink href="/rdv">
        <CalendarClock />
        Rendez-vous
      </SidebarLink>
      {role === 'admin' && (
        <SidebarLink href="/equipe">
          <Activity />
          Équipe
        </SidebarLink>
      )}
      <SidebarLink href="/webinaires" exact>
        <Radio />
        Webinaires
      </SidebarLink>
      <SidebarLink href="/webinaires/suivi">
        <KanbanSquare />
        Suivi webinaires
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
      <SidebarLink href="/ads">
        <TrendingUp />
        Ads
      </SidebarLink>
      <SidebarLink href="/performance">
        <BarChart3 />
        Performance
      </SidebarLink>
      <SidebarLink href="/alertes">
        <BellRing />
        Mes alertes
      </SidebarLink>
      <SidebarLink href="/sources">
        <Radio />
        État des sources
      </SidebarLink>
    </div>
  );
}
