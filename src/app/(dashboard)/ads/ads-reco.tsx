'use client';

import { Sparkles } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import { adsRecommendationAction } from './actions';

/** Carte « Analyse du Pilote » : recommandations IA sur les Ads de la période (lecture seule). */
export function AdsReco() {
  const params = useSearchParams();
  const { toast, runWithActivity } = useToast();
  const [pending, startTransition] = useTransition();
  const [reco, setReco] = useState<string | null>(null);

  function analyze() {
    startTransition(async () => {
      const r = await runWithActivity('Le Pilote analyse tes campagnes…', () =>
        adsRecommendationAction({
          period: params.get('period') ?? undefined,
          from: params.get('from') ?? undefined,
          to: params.get('to') ?? undefined,
        }),
      );
      if (!r.ok) {
        toast(r.message, { variant: 'error' });
        return;
      }
      setReco(r.reco);
    });
  }

  return (
    <div
      className="view-card"
      style={{ borderColor: 'color-mix(in srgb, var(--ai) 30%, transparent)' }}
    >
      <div className="view-card-header">
        <div
          className="view-card-title"
          style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ai)' }}
        >
          <Sparkles size={16} />
          Analyse du Pilote
        </div>
        <button type="button" className="btn btn-sm btn-ai" onClick={analyze} disabled={pending}>
          <Sparkles size={13} />
          {pending ? 'Analyse…' : reco ? 'Réanalyser' : 'Analyser la période'}
        </button>
      </div>
      <div className="view-card-body">
        {reco ? (
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-2)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
          >
            {reco}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            Le Pilote lit tes vrais chiffres de campagnes et te propose 2 à 4 actions concrètes
            (rééquilibrer un budget, couper une campagne, etc.). Il conseille — tu décides.
          </div>
        )}
      </div>
    </div>
  );
}
