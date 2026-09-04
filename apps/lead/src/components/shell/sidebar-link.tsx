'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function SidebarLink({
  href,
  exact = false,
  badge,
  hot,
  children,
}: {
  href: string;
  exact?: boolean;
  badge?: number;
  hot?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} className={cn('sidebar-link', active && 'active')}>
      {children}
      {badge !== undefined && badge > 0 ? (
        <span className={cn('sidebar-link-badge', hot && 'hot')}>{badge}</span>
      ) : null}
    </Link>
  );
}
