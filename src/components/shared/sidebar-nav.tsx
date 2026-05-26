'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function SidebarLink({
  href,
  children,
  exact = false,
  style,
}: {
  href: string;
  children: ReactNode;
  exact?: boolean;
  style?: React.CSSProperties;
}) {
  const pathname = usePathname();
  const isActive = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`view-sidebar-link${isActive ? ' active' : ''}`}
      style={style}
    >
      {children}
    </Link>
  );
}
