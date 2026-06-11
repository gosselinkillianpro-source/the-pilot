import { Clock, Mail } from 'lucide-react';

/**
 * Automations email — feuille de route (PAS encore actives).
 * Affichage HONNÊTE : aucune métrique inventée tant que le moteur de flows
 * (Lot 3 : machine à rebond + endormis, avec file de validation humaine) n'est
 * pas branché. Les automations apparaîtront ici une fois réellement exécutées.
 */
const PLANNED_FLOWS = [
  {
    id: 'welcome',
    name: 'Bienvenue + onboarding',
    desc: "Séquence d'accueil après inscription SAH, guide vers la complétion du profil.",
  },
  {
    id: 'hot',
    name: 'Relance leads chauds (J+3)',
    desc: 'Relance les prospects qui ouvrent/cliquent sans être rappelés.',
  },
  {
    id: 'rebond',
    name: 'Rebond avant remboursement',
    desc: 'Avant le remboursement d’un projet, propose le réinvestissement (validation humaine).',
  },
  {
    id: 'dormant',
    name: 'Réveil des inscrits jamais investis',
    desc: 'Réactive le stock d’inscrits onboardés qui n’ont jamais souscrit.',
  },
];

export default function EmailFlowsPage() {
  return (
    <>
      <div>
        <h1 className="page-title">Email flows</h1>
        <div className="page-desc">
          Automations email à venir — chaque envoi passera par une validation humaine + un scan AMF.
        </div>
      </div>

      <div className="alert alert-info">
        <span className="alert-icon">
          <Clock size={16} />
        </span>
        <div className="alert-body">
          <div className="alert-title">Pas encore actif</div>
          <div className="alert-description">
            Aucune automation ne tourne pour l'instant (aucun email n'est envoyé automatiquement).
            Le moteur de flows est en construction : les séquences ci-dessous seront créées ici, et
            <strong> rien ne partira sans ta validation</strong>.
          </div>
        </div>
      </div>

      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Séquences prévues ({PLANNED_FLOWS.length})</div>
          <span className="badge badge-neutral">à venir</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {PLANNED_FLOWS.map((flow, idx) => (
            <div
              key={flow.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '14px 20px',
                borderBottom: idx < PLANNED_FLOWS.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'var(--brand-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--brand)',
                  flexShrink: 0,
                }}
              >
                <Mail size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
                  {flow.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {flow.desc}
                </div>
              </div>
              <span className="badge badge-neutral">à venir</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
