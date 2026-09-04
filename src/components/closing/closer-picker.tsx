import { Eye } from 'lucide-react';
import Link from 'next/link';
import type { ViewedCloser } from '@/lib/db/queries/viewed-closer';

/**
 * « Vue closer » pour l'admin : choisir le poste qu'on regarde. Les autres
 * paramètres d'URL (période, filtres) sont conservés d'un closer à l'autre.
 */
export function CloserPicker({
  viewed,
  basePath,
  params,
}: {
  viewed: ViewedCloser;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (!viewed.canPick || viewed.pickable.length === 0) return null;
  const href = (closerId: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
    p.set('closer', closerId);
    return `${basePath}?${p.toString()}`;
  };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <span
        style={{
          fontSize: 11,
          color: 'var(--text-4)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <Eye size={12} />
        Vue closer
      </span>
      {viewed.pickable.map((c) => {
        const active = c.id === viewed.viewedId;
        return (
          <Link
            key={c.id}
            href={href(c.id)}
            className={active ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            aria-current={active ? 'page' : undefined}
          >
            {c.name ?? 'Sans nom'}
            {c.role === 'admin' ? ' (admin)' : ''}
          </Link>
        );
      })}
    </div>
  );
}
