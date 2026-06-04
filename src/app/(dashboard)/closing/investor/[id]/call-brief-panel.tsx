'use client';

import { Sparkles } from 'lucide-react';
import { useState, useTransition } from 'react';
import { type CallBriefActionResult, draftCallBriefAction } from './actions';

export function CallBriefPanel({ investorId }: { investorId: string }) {
  const [pending, startTransition] = useTransition();
  const [res, setRes] = useState<CallBriefActionResult | null>(null);

  function generate() {
    setRes(null);
    startTransition(async () => {
      setRes(await draftCallBriefAction(investorId));
    });
  }

  return (
    <div className="view-card">
      <div className="view-card-header">
        <div
          className="view-card-title"
          style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ai)' }}
        >
          <Sparkles size={15} />
          Brief d'appel IA
        </div>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={generate}
          disabled={pending}
        >
          {pending ? 'Génération…' : 'Générer'}
        </button>
      </div>
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!res && (
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
            Génère un script d'appel prêt-à-l'emploi (accroche, objectif, objections, projets), calé
            sur le statut et les projets ouverts. Aide à la prépa — tu gardes la main.
          </p>
        )}
        {res && !res.ok && (
          <p style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>{res.message}</p>
        )}
        {res?.ok && (
          <>
            <Block label="Accroche">{res.brief.accroche}</Block>
            <Block label="Objectif">{res.brief.objectif}</Block>
            {res.brief.points.length > 0 && (
              <div>
                <Label>Points à aborder</Label>
                <ul
                  style={{
                    margin: '4px 0 0',
                    paddingLeft: 18,
                    fontSize: 13,
                    color: 'var(--text-2)',
                  }}
                >
                  {res.brief.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {res.brief.objections.length > 0 && (
              <div>
                <Label>Objections probables</Label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  {res.brief.objections.map((o) => (
                    <div key={o.objection} style={{ fontSize: 12 }}>
                      <div style={{ color: 'var(--text-1)', fontWeight: 600 }}>
                        « {o.objection} »
                      </div>
                      <div style={{ color: 'var(--text-3)' }}>→ {o.reponse}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {res.brief.projets.length > 0 && (
              <Block label="Projets à évoquer">{res.brief.projets.join(', ')}</Block>
            )}
            <p style={{ fontSize: 10, color: 'var(--text-4)', margin: 0 }}>
              Coût IA : {res.costEur.toFixed(4)} € · Vérifie les chiffres avant de citer.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--text-4)',
      }}
    >
      {children}
    </span>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div style={{ fontSize: 13, color: 'var(--text-1)', marginTop: 2 }}>{children}</div>
    </div>
  );
}
