'use client';

import { BarChart3, FolderKanban, Network, PhoneCall, Receipt, Users2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/reseau', label: "Vue d'ensemble", icon: BarChart3, exact: true },
  { href: '/reseau/closing', label: 'À appeler', icon: PhoneCall, exact: false },
  { href: '/reseau/membres', label: 'Mon réseau', icon: Users2, exact: false },
  { href: '/reseau/souscriptions', label: 'Investissements', icon: Receipt, exact: false },
  { href: '/reseau/projets', label: 'Projets', icon: FolderKanban, exact: false },
] as const;

export function AffiliateNav() {
  const pathname = usePathname();
  return (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
      <span
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-4)',
          padding: '8px 12px 4px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Network size={12} /> Espace affilié
      </span>
      {ITEMS.map((it) => {
        const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: active ? 600 : 500,
              color: active ? 'var(--text-1)' : 'var(--text-2)',
              background: active ? 'var(--glass-bg-strong, rgba(255,255,255,0.06))' : 'transparent',
            }}
          >
            <Icon size={16} />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
