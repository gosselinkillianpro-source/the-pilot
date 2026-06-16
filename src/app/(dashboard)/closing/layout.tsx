import type { ReactNode } from 'react';
import { ClosingNav } from '@/components/closing/closing-nav';
import { LeadSearch } from '@/components/closing/lead-search';

export default function ClosingLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <LeadSearch />
      <ClosingNav />
      {children}
    </div>
  );
}
