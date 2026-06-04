'use client';

import { BarChart3, CalendarClock, KanbanSquare, ListChecks, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const TABS: { href: string; label: string; icon: ReactNode }[] = [
  { href: '/closing/queue', label: "File d'appels", icon: <ListChecks size={15} /> },
  { href: '/closing/today', label: "Aujourd'hui", icon: <CalendarClock size={15} /> },
  { href: '/closing/board', label: 'Pipeline', icon: <KanbanSquare size={15} /> },
  { href: '/closing/pipeline', label: 'Investisseurs', icon: <Users size={15} /> },
  { href: '/closing/performance', label: 'Performance', icon: <BarChart3 size={15} /> },
];

export function ClosingNav() {
  const pathname = usePathname();
  return (
    <nav
      style={{
        display: 'flex',
        gap: 4,
        borderBottom: '1px solid var(--border)',
        marginBottom: 4,
      }}
    >
      {TABS.map((t) => {
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
            }}
          >
            {t.icon}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
