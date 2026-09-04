'use client';

import {
  CalendarClock,
  KanbanSquare,
  ListChecks,
  Receipt,
  Trophy,
  UserSquare2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { ClosingTab, ClosingTabIcon } from './closing-tabs';

const ICONS: Record<ClosingTabIcon, ReactNode> = {
  today: <CalendarClock size={15} />,
  clients: <UserSquare2 size={15} />,
  results: <Trophy size={15} />,
  queue: <ListChecks size={15} />,
  board: <KanbanSquare size={15} />,
  investors: <Users size={15} />,
  subscriptions: <Receipt size={15} />,
  ranking: <Trophy size={15} />,
};

export function ClosingNav({ tabs }: { tabs: ClosingTab[] }) {
  const pathname = usePathname();
  return (
    <nav
      style={{
        display: 'flex',
        gap: 4,
        borderBottom: '1px solid var(--border)',
        marginBottom: 4,
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: 600,
              color: active ? 'var(--text-1)' : 'var(--text-3)',
              borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
              marginBottom: -1,
              textDecoration: 'none',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {ICONS[t.icon]}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
