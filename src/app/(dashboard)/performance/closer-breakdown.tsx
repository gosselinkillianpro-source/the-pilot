import type { CloserPerf } from '@/lib/db/queries/closing';

/**
 * Détail par closer (appels, joints, leads, attributions, € attribués).
 *
 * Vient de l'ancienne page /closing/performance, fusionnée ici : les deux
 * écrans appelaient getCloserPerformance(period) et affichaient les mêmes
 * KPI, avec deux entrées de menu distinctes pour la même mesure.
 */

const COLUMNS = '1.3fr 0.6fr 0.6fr 0.6fr 0.7fr 0.7fr 0.8fr 1fr';

function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

export function CloserBreakdown({ closers }: { closers: CloserPerf[] }) {
  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title">Par closer</div>
      </div>
      <div className="view-card-body" style={{ padding: 0 }}>
        <div
          className="r-stack r-head"
          style={{
            display: 'grid',
            gridTemplateColumns: COLUMNS,
            gap: 8,
            padding: '10px 20px',
            borderBottom: '1px solid var(--border)',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-4)',
          }}
        >
          <span>Closer</span>
          <span style={{ textAlign: 'right' }}>Appels</span>
          <span style={{ textAlign: 'right' }}>Joints</span>
          <span style={{ textAlign: 'right' }}>Leads</span>
          <span
            style={{ textAlign: 'right' }}
            title="Profils complétés après son appel (détecté au sync)"
          >
            Profil compl.
          </span>
          <span
            style={{ textAlign: 'right' }}
            title="Inscriptions finalisées / KYC débloqués après son appel"
          >
            KYC débloq.
          </span>
          <span style={{ textAlign: 'right' }}>Souscr. attr.</span>
          <span style={{ textAlign: 'right' }}>€ attribués</span>
        </div>

        {closers.length === 0 ? (
          <div style={{ padding: 20, fontSize: 13, color: 'var(--text-3)' }}>
            Aucun closer enregistré (crée des comptes closer).
          </div>
        ) : (
          closers.map((c, idx) => (
            <div
              key={c.closerId}
              className="r-stack"
              style={{
                display: 'grid',
                gridTemplateColumns: COLUMNS,
                gap: 8,
                padding: '12px 20px',
                borderBottom: idx < closers.length - 1 ? '1px solid var(--border)' : 'none',
                fontSize: 13,
                alignItems: 'center',
              }}
            >
              <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>
                {c.name ?? c.closerId}
                <span style={{ color: 'var(--text-4)', fontWeight: 400, fontSize: 11 }}>
                  {' '}
                  ({c.role})
                </span>
              </span>
              <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>{c.calls}</span>
              <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>{c.reached}</span>
              <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>{c.assigned}</span>
              <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>
                {c.attributedRegistration}
              </span>
              <span style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>
                {c.attributedKyc}
              </span>
              <span style={{ textAlign: 'right', color: 'var(--text-1)', fontWeight: 600 }}>
                {c.attributedSubs}
              </span>
              <span style={{ textAlign: 'right', color: 'var(--text-1)', fontWeight: 600 }}>
                {money(c.attributedAmount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
