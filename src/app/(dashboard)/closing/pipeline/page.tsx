import { Filter, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import {
  getInitials,
  getScoreClass,
  mockInvestors,
  type PipelineStage,
  STAGE_LABELS,
} from '@/lib/mock-data';

const STAGES: PipelineStage[] = ['new', 'meeting', 'proposal', 'closed'];

export default function PipelinePage() {
  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
        }}
      >
        <div>
          <h1 className="page-title">Pipeline closing</h1>
          <div className="page-desc">
            {mockInvestors.length} leads · IA scoring actif · Cliquez sur un lead pour la fiche
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm">
            <Filter />
            Filtrer
          </button>
          <button type="button" className="btn btn-ai btn-sm">
            <Sparkles />
            Re-scorer tout
          </button>
          <button type="button" className="btn btn-primary btn-sm">
            <Plus />
            Nouveau lead
          </button>
        </div>
      </div>

      <div className="view-kanban">
        {STAGES.map((stage) => {
          const investors = mockInvestors.filter((i) => i.stage === stage);
          return (
            <div key={stage} className="view-kanban-col" data-stage={stage}>
              <div className="view-kanban-col-header">
                <div className="view-kanban-col-name">{STAGE_LABELS[stage]}</div>
                <div className="view-kanban-col-count">{investors.length}</div>
              </div>

              {investors.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/closing/investor/${inv.id}`}
                  className="view-kanban-card"
                >
                  <div className="view-kanban-card-header">
                    <div>
                      <div className="view-kanban-card-name">
                        {inv.firstName} {inv.lastName[0]}.
                      </div>
                      <div className="view-kanban-card-meta">
                        {inv.id.toUpperCase()} · {inv.segment}
                      </div>
                    </div>
                    <div className={`view-kanban-card-score ${getScoreClass(inv.score)}`}>
                      {inv.score}
                    </div>
                  </div>

                  <div className="view-kanban-card-footer">
                    <div className={`avatar avatar-sm avatar-${inv.avatarColor}`}>
                      {getInitials(inv.firstName, inv.lastName)}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--text-2)',
                      }}
                    >
                      {inv.amountMentioned
                        ? `${(inv.amountMentioned / 1000).toFixed(0)}K€`
                        : inv.totalInvested > 0
                          ? `${(inv.totalInvested / 1000).toFixed(0)}K€ total`
                          : '—'}
                    </div>
                    {inv.aiSuggested && (
                      <span className="view-kanban-card-tag">
                        <Sparkles size={9} />
                        IA
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
