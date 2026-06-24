import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, Empty, money, NotLinked, stageLabel, Table } from '@/components/affiliate/ui';
import { getAffiliateInvestorDetail, resolveAffiliateScope } from '@/lib/db/queries/affiliate';

export const dynamic = 'force-dynamic';

const TEMP_COLOR: Record<string, string> = {
  hot: 'var(--danger, #c0392b)',
  warm: 'var(--warning, #d97706)',
  cold: 'var(--text-3)',
};
const SUB_STATUS: Record<string, string> = {
  signed: 'Signée',
  paid: 'Payée',
  active: 'Active',
  repaid: 'Remboursée',
  cancelled: 'Annulée',
};
const ACT_TYPE: Record<string, string> = {
  call_outbound: 'Appel sortant',
  call_inbound: 'Appel entrant',
  email: 'Email',
  note: 'Note',
  meeting: 'RDV',
  status_change: 'Changement d’étape',
};

function fmtDate(s: string | null): string {
  return s ? s.slice(0, 10) : '—';
}

export default async function FicheInvestisseurPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const scope = await resolveAffiliateScope();
  if (!scope) return <NotLinked title="Fiche investisseur" />;
  const { id } = await params;

  // CONTRÔLE D'APPARTENANCE : null = hors réseau (ou inexistant) → 404, aucune fuite.
  const detail = await getAffiliateInvestorDetail(id, scope.sahId);
  if (!detail) notFound();

  const { investor: i, depth, subscriptions, interactions } = detail;
  const sc = i.scored;

  return (
    <>
      <Link
        href="/reseau/membres"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          color: 'var(--text-3)',
          marginBottom: 4,
        }}
      >
        <ArrowLeft size={14} /> Mon réseau
      </Link>

      <div>
        <h1 className="page-title">{i.fullName ?? '(sans nom)'}</h1>
        <div className="page-desc" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {depth != null && <span className="badge badge-neutral">Niveau N+{depth}</span>}
          <span className="badge badge-neutral">{sc.statusLabel}</span>
          <span className="badge badge-neutral">{stageLabel(i.pipelineStage)}</span>
          {i.city ? <span style={{ color: 'var(--text-3)' }}>{i.city}</span> : null}
        </div>
      </div>

      {/* Priorité d'appel */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Priorité d'appel</div>
          <span
            className="badge"
            style={{
              color: '#fff',
              background: TEMP_COLOR[sc.temperature] ?? 'var(--text-3)',
            }}
          >
            {sc.temperatureLabel} · {sc.priority}
          </span>
        </div>
        <div
          className="view-card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}
        >
          <div style={{ color: 'var(--text-2)' }}>
            {sc.queueLabel}
            {sc.callGoal ? ` · 🎯 ${sc.callGoal}` : ''}
          </div>
          {sc.factors.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sc.factors.map((f) => (
                <span key={f} className="badge badge-neutral" style={{ fontSize: 11 }}>
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Coordonnées */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Coordonnées</div>
        </div>
        <div
          className="view-card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}
        >
          <div>
            <span style={{ color: 'var(--text-3)' }}>Email : </span>
            <span style={{ color: 'var(--text-1)' }}>{i.email}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-3)' }}>Téléphone : </span>
            <span style={{ color: 'var(--text-1)' }}>{i.phone ?? '—'}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-3)' }}>Total investi : </span>
            <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>
              {money(i.totalInvested)}
            </span>
          </div>
        </div>
      </div>

      <Card title="Souscriptions">
        {subscriptions.length === 0 ? (
          <Empty label="Aucune souscription." />
        ) : (
          <Table
            head={['Projet', 'Montant', 'Statut', 'Date']}
            cols="2fr 1fr 1fr 1fr"
            rows={subscriptions.map((s) => [
              s.projectName ?? '—',
              money(s.amount),
              SUB_STATUS[s.status] ?? s.status,
              fmtDate(s.date),
            ])}
          />
        )}
      </Card>

      <Card title="Activité récente">
        {interactions.length === 0 ? (
          <Empty label="Aucune activité enregistrée." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {interactions.map((a, idx) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: événements sans id exposé
                key={idx}
                style={{
                  padding: '10px 16px',
                  borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>
                    {ACT_TYPE[a.type] ?? a.type}
                    {a.outcome ? (
                      <span style={{ color: 'var(--text-3)' }}> · {a.outcome}</span>
                    ) : null}
                  </span>
                  <span style={{ color: 'var(--text-4)' }}>{fmtDate(a.at)}</span>
                </div>
                {a.note ? (
                  <div style={{ color: 'var(--text-2)', marginTop: 2 }}>{a.note}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
