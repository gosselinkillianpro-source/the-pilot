import type { SourceStatus } from '@/lib/sources/freshness';

/**
 * Badge de fraîcheur honnête (Phase 3 — confiance visible).
 * Affiche « Données à jour il y a X · source », ou un état d'erreur explicite
 * (« non disponible », « non branchée ») plutôt qu'un chiffre périmé présenté comme frais.
 */

const STATUS_COLOR: Record<SourceStatus, string> = {
  ok: 'var(--success)',
  stale: 'var(--warning)',
  down: 'var(--danger)',
  not_configured: 'var(--text-4)',
  not_connected: 'var(--text-4)',
};

export function FreshnessBadge({
  status,
  freshness,
  sourceLabel,
}: {
  status: SourceStatus;
  freshness: string;
  sourceLabel?: string;
}) {
  const color = STATUS_COLOR[status];
  const src = sourceLabel ? ` · ${sourceLabel}` : '';
  let text: string;
  if (status === 'down') text = `Donnée non disponible${src}`;
  else if (status === 'not_connected') text = `${sourceLabel ?? 'Source'} non branchée`;
  else if (status === 'not_configured') text = `${sourceLabel ?? 'Source'} non configurée`;
  else if (status === 'stale') text = `Données anciennes (${freshness})${src}`;
  else text = `Données ${freshness}${src}`;

  return (
    <span
      title={text}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        color: 'var(--text-3)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: color,
          boxShadow: status === 'ok' || status === 'stale' ? `0 0 6px ${color}` : 'none',
          flexShrink: 0,
        }}
      />
      {text}
    </span>
  );
}
