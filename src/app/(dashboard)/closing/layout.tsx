import type { ReactNode } from 'react';
import { ClosingNav } from '@/components/closing/closing-nav';
import { closingTabsFor } from '@/components/closing/closing-tabs';
import { LeadSearch } from '@/components/closing/lead-search';
import { LiveSync } from '@/components/shared/live-sync';
import { getAuthenticatedUser } from '@/lib/auth';
import { SYNC_TOPICS } from '@/lib/realtime/topics';

/**
 * Toutes les pages closing sont travaillées à plusieurs en même temps : poste
 * du jour, carnet, résultats, fiches. Le direct est posé ici une fois pour
 * toutes, avec l'indicateur d'état à côté des onglets. Les onglets dépendent
 * du rôle : trois pour un closer, la vue d'ensemble en plus pour l'admin.
 */
export default async function ClosingLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <LeadSearch />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ClosingNav tabs={closingTabsFor(user.role)} />
        </div>
        <LiveSync
          topics={[SYNC_TOPICS.closing, SYNC_TOPICS.sah, SYNC_TOPICS.gamification]}
          showBadge
        />
      </div>
      {children}
    </div>
  );
}
