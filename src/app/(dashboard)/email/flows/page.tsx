import { Mail, Plus } from 'lucide-react';

const FAKE_FLOWS = [
  {
    id: 'f1',
    name: 'Bienvenue + onboarding',
    stage: 'active',
    sent: 487,
    opened: '64%',
    clicked: '23%',
  },
  {
    id: 'f2',
    name: 'Relance leads chauds (J+3)',
    stage: 'active',
    sent: 142,
    opened: '71%',
    clicked: '38%',
  },
  {
    id: 'f3',
    name: 'Rebond 11 mois pré-remboursement',
    stage: 'active',
    sent: 38,
    opened: '82%',
    clicked: '47%',
  },
  { id: 'f4', name: 'Newsletter mensuelle', stage: 'draft', sent: 0, opened: '—', clicked: '—' },
];

export default function EmailFlowsPage() {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">Email flows</h1>
          <div className="page-desc">
            Automations email — branchement Brevo + scanner AMF avant chaque envoi.
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-sm">
          <Plus />
          Nouveau flow
        </button>
      </div>

      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Flows actifs ({FAKE_FLOWS.length})</div>
          <span className="badge badge-success badge-dot">Brevo connecté</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {FAKE_FLOWS.map((flow, idx) => (
            <div
              key={flow.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '14px 20px',
                borderBottom: idx < FAKE_FLOWS.length - 1 ? '1px solid var(--border)' : 'none',
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
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
                  {flow.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-3)',
                    fontFamily: 'var(--font-mono)',
                    marginTop: 2,
                  }}
                >
                  {flow.sent} envoyés · {flow.opened} ouverts · {flow.clicked} cliqués
                </div>
              </div>
              <span
                className={`badge ${flow.stage === 'active' ? 'badge-success badge-dot' : 'badge-neutral'}`}
              >
                {flow.stage === 'active' ? 'Active' : 'Brouillon'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="alert alert-info">
        <span className="alert-icon">
          <Mail size={16} />
        </span>
        <div className="alert-body">
          <div className="alert-title">Données fake en attente</div>
          <div className="alert-description">
            Le branchement à Brevo se fera après l'appel SAH. Les flows réels seront créés ici via
            le builder visuel.
          </div>
        </div>
      </div>
    </>
  );
}
