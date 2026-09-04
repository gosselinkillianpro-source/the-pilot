'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { saveCriteriaAction } from '@/app/(app)/leads/[id]/actions';
import { useToast } from '@/components/ui/toast';
import type { CriteriaChecks } from '@/lib/db/schema';
import type { UnionCriterion } from '@/lib/domain/criteria';

type BuyerQual = {
  buyerId: string;
  name: string;
  qualified: boolean;
  score: number;
  mandatoryTotal: number;
};

/** Une case par critère : oui / non / non vérifié. Le setter a le dernier mot sur l'évaluation automatique. */
export function CriteriaChecklist({
  leadId,
  criteria,
  checks: initial,
  buyerQualifications,
  editable,
}: {
  leadId: string;
  criteria: UnionCriterion[];
  checks: CriteriaChecks;
  buyerQualifications: BuyerQual[];
  editable: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [checks, setChecks] = useState<CriteriaChecks>(initial);
  const [quals, setQuals] = useState(buyerQualifications);
  const [pending, start] = useTransition();

  function set(key: string, value: boolean | null) {
    const next = { ...checks, [key]: value };
    setChecks(next);
    start(async () => {
      const r = await saveCriteriaAction(leadId, next);
      if (!r.ok) {
        toast.push(r.error, 'error');
        return;
      }
      const data = r.data as
        | {
            qualifications: {
              buyerId: string;
              qualified: boolean;
              score: number;
              mandatoryTotal: number;
            }[];
          }
        | undefined;
      if (data) {
        setQuals((prev) =>
          prev.map((p) => {
            const q = data.qualifications.find((x) => x.buyerId === p.buyerId);
            return q
              ? { ...p, qualified: q.qualified, score: q.score, mandatoryTotal: q.mandatoryTotal }
              : p;
          }),
        );
      }
      router.refresh();
    });
  }

  if (criteria.length === 0) {
    return <p className="hint">Aucun critère : aucun acheteur actif n’a de critères configurés.</p>;
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      {criteria.map((c) => {
        const setter = checks[c.key];
        const final = setter === true || setter === false ? setter : c.auto;
        return (
          <div
            key={c.key}
            className="row"
            style={{
              justifyContent: 'space-between',
              gap: 12,
              padding: '8px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {c.label}
                {c.mandatoryFor.length ? (
                  <span className="hint"> · obligatoire pour {c.mandatoryFor.join(', ')}</span>
                ) : null}
              </div>
              <div className="hint">
                Formulaire :{' '}
                {c.auto === true ? 'oui' : c.auto === false ? 'non' : 'ne permet pas de trancher'}
                {setter === true || setter === false ? ` · setter : ${setter ? 'oui' : 'non'}` : ''}
              </div>
            </div>
            <fieldset className="seg" aria-label={c.label} style={{ border: 0, margin: 0 }}>
              <button
                type="button"
                className={final === true ? 'on yes' : ''}
                disabled={!editable || pending}
                onClick={() => set(c.key, true)}
              >
                Oui
              </button>
              <button
                type="button"
                className={final === false ? 'on no' : ''}
                disabled={!editable || pending}
                onClick={() => set(c.key, false)}
              >
                Non
              </button>
              <button
                type="button"
                className={final === null ? 'on' : ''}
                disabled={!editable || pending}
                onClick={() => set(c.key, null)}
              >
                Non vérifié
              </button>
            </fieldset>
          </div>
        );
      })}
      <div className="row" style={{ gap: 8, paddingTop: 4 }}>
        {quals.map((q) => (
          <span key={q.buyerId} className={`pill ${q.qualified ? 'pill-success' : 'pill-warning'}`}>
            {q.name} · {q.score}/{q.mandatoryTotal} {q.qualified ? '✓ qualifié' : 'à compléter'}
          </span>
        ))}
      </div>
    </div>
  );
}
