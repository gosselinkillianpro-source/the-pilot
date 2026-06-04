import type { ReactNode } from 'react';
import { ClosingNav } from '@/components/closing/closing-nav';

export default function ClosingLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ClosingNav />
      {children}
    </div>
  );
}
