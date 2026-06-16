import { AlertTriangle, CheckCircle2, Clock, PlugZap, XCircle } from 'lucide-react';
import type { SourceHealth, SourceStatus } from '@/lib/sources/freshness';
import { probeAllSources } from '@/lib/sources/health';

export const dynamic = 'force-dynamic';

const STATUS_META: Record<
  SourceStatus,
  { label: string; color: string; Icon: typeof CheckCircle2 }
> = {
  ok: { label: 'À jour', color: 'var(--success)', Icon: CheckCircle2 },
  stale: { label: 'Données anciennes', color: 'var(--warning)', Icon: Clock },
  down: { label: 'En échec', color: 'var(--danger)', Icon: XCircle },
  not_configured: { label: 'Non configurée', color: 'var(--text-4)', Icon: PlugZap },
  not_connected: { label: 'Non branchée', color: 'var(--text-4)', Icon: PlugZap },
};

function SourceCard({ s }: { s: SourceHealth }) {
  const meta = STATUS_META[s.status];
  return (
    <div className="view-card" style={{ minWidth: 0 }}>
      <div
        className="view-card-body"
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}
      >
        <span style={{ color: meta.color, display: 'flex', flexShrink: 0 }}>
          <meta.Icon size={20} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{s.label}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{s.detail}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: meta.color }}>{meta.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{s.freshness}</div>
        </div>
      </div>
    </div>
  );
}

export default async function SourcesPage() {
  const sources = await probeAllSources();
  const branchees = sources.filter((s) => s.status !== 'not_connected');
  const nonBranchees = sources.filter((s) => s.status === 'not_connected');
  const enEchec = sources.filter((s) => s.status === 'down').length;

  return (
    <>
      <div>
        <h1 className="page-title">Mes chiffres sont-ils à jour et fiables ?</h1>
        <div className="page-desc">
          État réel de chaque source de données. Une source en échec affiche « non disponible » —
          jamais un chiffre périmé présenté comme frais.
        </div>
      </div>

      {enEchec > 0 ? (
        <div className="alert alert-danger">
          <span className="alert-icon">
            <AlertTriangle size={16} />
          </span>
          <div className="alert-body">
            <div className="alert-title">
              {enEchec} source{enEchec > 1 ? 's' : ''} en échec
            </div>
            <div className="alert-description">
              Les chiffres qui en dépendent sont à considérer comme non disponibles tant que la
              connexion n'est pas rétablie.
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-3)',
            textTransform: 'uppercase',
            letterSpacing: 0.3,
          }}
        >
          Sources branchées
        </div>
        {branchees.map((s) => (
          <SourceCard key={s.key} s={s} />
        ))}
      </div>

      {nonBranchees.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-3)',
              textTransform: 'uppercase',
              letterSpacing: 0.3,
            }}
          >
            Annoncées mais non branchées
          </div>
          {nonBranchees.map((s) => (
            <SourceCard key={s.key} s={s} />
          ))}
          <div style={{ fontSize: 12, color: 'var(--text-4)', lineHeight: 1.5 }}>
            ⚠️ Ces sources figurent dans la roadmap mais n'ont aucun code d'intégration. Tant que{' '}
            <strong>Calendly</strong> n'est pas branché, aucune métrique « RDV pris » (funnel
            investisseurs 10K+) n'est réelle dans THE PILOT.
          </div>
        </div>
      ) : null}
    </>
  );
}
