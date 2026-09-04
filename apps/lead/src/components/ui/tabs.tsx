import Link from 'next/link';
import { cn } from '@/lib/cn';

export type TabItem = { href: string; label: string; count?: number; active: boolean };

export function Tabs({ items }: { items: TabItem[] }) {
  return (
    <nav className="tabs" aria-label="Filtres">
      {items.map((t) => (
        <Link key={t.href} href={t.href} className={cn('tab', t.active && 'active')}>
          {t.label}
          {t.count !== undefined ? <span className="tab-count">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
