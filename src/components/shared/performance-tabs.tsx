import Link from 'next/link';

const TABS = [
  { href: '/performance', label: 'ROI par canal' },
  { href: '/performance/actions', label: 'ROI par action' },
];

export function PerformanceTabs({ active }: { active: string }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginTop: 4 }}>
      {TABS.map((tab) => {
        const isActive = tab.href === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--brand)' : 'var(--text-3)',
              borderBottom: isActive ? '2px solid var(--brand)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
