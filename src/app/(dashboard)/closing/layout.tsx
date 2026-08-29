import type { ReactNode } from 'react';
import { ClosingNav } from '@/components/closing/closing-nav';
import { LeadSearch } from '@/components/closing/lead-search';
import { LiveSync } from '@/components/shared/live-sync';
import { SYNC_TOPICS } from '@/lib/realtime/topics';

/**
 * Toutes les pages closing sont travaillées à plusieurs en même temps : file
 * d'appels, cockpit du jour, suivi des appels, fiches. Le direct est posé ici
 * une fois pour toutes, avec l'indicateur d'état à côté des onglets.
 */
export default function ClosingLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <LeadSearch />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ClosingNav />
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
