import Link from 'next/link';
import { INVESTOR_VIEWS, type ViewKey } from '@/lib/investor-views';

/**
 * Barre de vues. Chaque vue est un lien — l'état vit dans l'URL, donc une vue
 * filtrée se partage, se met en favori et survit à un rechargement.
 */
export function ViewTabs({ active, query }: { active: ViewKey; query: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        borderBottom: '1px solid var(--border)',
        paddingBottom: 10,
      }}
    >
      {INVESTOR_VIEWS.map((v) => {
        const isActive = v.key === active;
        const params = new URLSearchParams();
        params.set('vue', v.key);
        if (query) params.set('q', query);
        return (
          <Link
            key={v.key}
            href={`/closing/investisseurs?${params.toString()}`}
            className={isActive ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            aria-current={isActive ? 'page' : undefined}
          >
            {v.label}
          </Link>
        );
      })}
    </div>
  );
}
