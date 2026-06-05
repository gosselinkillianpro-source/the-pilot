'use client';

import { Loader2, Sparkles, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import { deleteInvestorAssetAction, generateCallScriptAssetAction } from './actions';

export type ScriptBrief = {
  accroche: string;
  objectif: string;
  points: string[];
  objections: { objection: string; reponse: string }[];
  projets: string[];
};

export type SavedScript = {
  id: string;
  status: 'generating' | 'ready' | 'error';
  brief: ScriptBrief | null;
  costEur: string | null;
  error: string | null;
};

export function CallBriefPanel({
  investorId,
  saved,
}: {
  investorId: string;
  saved: SavedScript | null;
}) {
  const router = useRouter();
  const { toast, runWithActivity } = useToast();
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const res = await runWithActivity('Génération du script d’appel', () =>
        generateCallScriptAssetAction({ investorId }),
      );
      if (res.ok) {
        toast('Script généré et sauvegardé.', { variant: 'success' });
        router.refresh();
      } else {
        toast(res.message, { variant: 'error' });
      }
    });
  }

  function remove() {
    if (!saved) return;
    startTransition(async () => {
      const res = await deleteInvestorAssetAction({ assetId: saved.id });
      if (res.ok) {
        toast('Script supprimé.', { variant: 'info' });
        router.refresh();
      } else {
        toast(res.message, { variant: 'error' });
      }
    });
  }

  const brief = saved?.brief ?? null;

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
        <div style={{ display: 'flex', gap: 6 }}>
          {saved?.status === 'ready' && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={remove}
              disabled={pending}
              style={{ color: 'var(--danger)' }}
            >
              <Trash2 size={13} />
              Supprimer
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={generate}
            disabled={pending}
          >
            {pending ? 'Génération…' : saved ? 'Régénérer' : 'Générer'}
          </button>
        </div>
      </div>
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!saved && (
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
            Génère un script d'appel prêt-à-l'emploi (accroche, objectif, objections, projets), calé
            sur le statut et les projets ouverts. <strong>Sauvegardé</strong> sur la fiche. Aide à
            la prépa — tu gardes la main.
          </p>
        )}

        {saved?.status === 'generating' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-2)' }}>
            <Loader2 size={16} className="spin" style={{ color: 'var(--ai)' }} />
            <span style={{ fontSize: 13 }}>
              Génération du script en cours… (continue en fond, tu peux quitter la page)
            </span>
          </div>
        )}

        {saved?.status === 'error' && (
          <p style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>
            {saved.error ?? 'La génération a échoué.'}
          </p>
        )}

        {saved?.status === 'ready' && brief && (
          <>
            <Block label="Accroche">{brief.accroche}</Block>
            <Block label="Objectif">{brief.objectif}</Block>
            {brief.points.length > 0 && (
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
                  {brief.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {brief.objections.length > 0 && (
              <div>
                <Label>Objections probables</Label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  {brief.objections.map((o) => (
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
            {brief.projets.length > 0 && (
              <Block label="Projets à évoquer">{brief.projets.join(', ')}</Block>
            )}
            <p style={{ fontSize: 10, color: 'var(--text-4)', margin: 0 }}>
              {saved.costEur ? `Coût IA : ${Number(saved.costEur).toFixed(4)} € · ` : ''}Vérifie les
              chiffres avant de citer.
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
