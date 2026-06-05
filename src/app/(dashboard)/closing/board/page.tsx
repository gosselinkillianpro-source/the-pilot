import { Layers } from 'lucide-react';
import { type FunnelStage, getPipelineFunnel } from '@/lib/db/queries/closing';

export const dynamic = 'force-dynamic';

// Étapes qui forment la progression (du 1er contact jusqu'à gagné).
const PROGRESSION = [
  'new',
  'contacted',
  'meeting_booked',
  'meeting_done',
  'proposal_sent',
  'closed_won',
];

function nb(n: number): string {
  return n.toLocaleString('fr-FR');
}

export default async function FunnelPage() {
  const funnel = await getPipelineFunnel();
  const byStage = new Map(funnel.map((f) => [f.stage, f]));
  const progression = PROGRESSION.map((s) => byStage.get(s)).filter(
    (s): s is FunnelStage => s != null,
  );
  const maxTotal = Math.max(1, ...progression.map((s) => s.total));
  const firstTotal = progression[0]?.total ?? 0;
  const lost = byStage.get('closed_lost');
  const dormant = byStage.get('dormant');

  return (
    <>
      <div>
        <h1 className="page-title">Tunnel de conversion</h1>
        <div className="page-desc">
          Combien de personnes à chaque étape, du premier contact jusqu'à l'investissement. Vue
          d'ensemble (lecture seule) — l'étape de chaque personne change depuis sa fiche ou la
          qualification d'appel.
        </div>
      </div>

      <div className="view-card">
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Layers size={15} />
            Étapes
          </div>
        </div>
        <div
          className="view-card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {progression.map((s, idx) => {
            const widthPct = Math.round((s.total / maxTotal) * 100);
            const isWon = s.stage === 'closed_won';
            // Taux de passage depuis l'étape précédente (information, pas un objectif).
            const prev = progression[idx - 1];
            const stepRate =
              prev && prev.total > 0 ? Math.round((s.total / prev.total) * 100) : null;
            return (
              <div
                key={s.stage}
                style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}
              >
                <span
                  style={{
                    width: 130,
                    flexShrink: 0,
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-1)',
                  }}
                >
                  {s.label}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 28,
                    borderRadius: 6,
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                    minWidth: 40,
                  }}
                >
                  <div
                    style={{
                      width: `${widthPct}%`,
                      height: '100%',
                      background: isWon
                        ? 'linear-gradient(90deg, var(--success) 0%, color-mix(in srgb, var(--success) 70%, white) 100%)'
                        : 'linear-gradient(90deg, var(--brand) 0%, var(--brand-bright) 100%)',
                      transition: 'width .3s',
                    }}
                  />
                </div>
                <span
                  style={{
                    width: 110,
                    flexShrink: 0,
                    textAlign: 'right',
                    fontSize: 13,
                    color: 'var(--text-2)',
                  }}
                >
                  <strong style={{ color: 'var(--text-1)', fontSize: 15 }}>{nb(s.total)}</strong>
                  {stepRate != null ? (
                    <span style={{ fontSize: 11, color: 'var(--text-4)' }}> · {stepRate}%</span>
                  ) : null}
                </span>
              </div>
            );
          })}
          {firstTotal === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
              Aucune personne dans le tunnel pour l'instant.
            </div>
          )}
        </div>
      </div>

      {/* Hors tunnel : perdus & en sommeil */}
      <div className="kpi-grid">
        <div className="view-card">
          <div
            className="view-card-body"
            style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            <span style={{ fontSize: 12, color: 'var(--danger)' }}>Perdus</span>
            <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}>
              {nb(lost?.total ?? 0)}
            </span>
          </div>
        </div>
        <div className="view-card">
          <div
            className="view-card-body"
            style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>En sommeil</span>
            <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}>
              {nb(dormant?.total ?? 0)}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
