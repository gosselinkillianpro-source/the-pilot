'use client';

import { ChevronDown, Send, Sparkles } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import { askPiloteAction, type PiloteActionResult } from './actions';

const EXAMPLES = [
  'Combien de personnes se sont inscrites complètement ces 4 derniers jours ?',
  'Collecte BREACH ce mois-ci ?',
  'Top 5 des villes par nombre d’investisseurs',
];

export function PilotePanel() {
  const { toast, runWithActivity } = useToast();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<PiloteActionResult | null>(null);
  const [showSql, setShowSql] = useState(false);

  function ask(question?: string) {
    const text = (question ?? q).trim();
    if (text.length < 3) {
      toast('Pose une question (au moins 3 caractères).', { variant: 'info' });
      return;
    }
    if (question) setQ(question);
    setShowSql(false);
    startTransition(async () => {
      const r = await runWithActivity('Le Pilote analyse tes données…', () =>
        askPiloteAction({ question: text }),
      );
      setRes(r);
      if (!r.ok) toast(r.message, { variant: 'error' });
    });
  }

  return (
    <div
      className="view-card"
      style={{ borderColor: 'color-mix(in srgb, var(--ai) 30%, var(--border))' }}
    >
      <div className="view-card-header">
        <div
          className="view-card-title"
          style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ai)' }}
        >
          <Sparkles size={16} />
          Le Pilote — demande en langage naturel
        </div>
      </div>
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <textarea
          className="input"
          rows={2}
          value={q}
          placeholder="Ex. Combien d'investisseurs BREACH ont investi plus de 10 000 € cette année ?"
          onChange={(e) => setQ(e.target.value)}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ai" onClick={() => ask()} disabled={pending}>
            <Send size={14} />
            {pending ? 'Analyse…' : 'Demander'}
          </button>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => ask(ex)}
              disabled={pending}
            >
              {ex}
            </button>
          ))}
        </div>

        {res?.ok && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                fontSize: 14,
                color: 'var(--text-1)',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                padding: '12px 14px',
                borderRadius: 8,
                background: 'var(--ai-bg)',
                border: '1px solid color-mix(in srgb, var(--ai) 20%, transparent)',
              }}
            >
              {res.answer}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                fontSize: 11,
                color: 'var(--text-4)',
              }}
            >
              <span title="Coût estimé de la requête IA">~{res.costEur.toFixed(4)} €</span>
              {res.sql && (
                <button
                  type="button"
                  onClick={() => setShowSql((v) => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-3)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                  }}
                >
                  <ChevronDown
                    size={12}
                    style={{ transform: showSql ? 'rotate(180deg)' : 'none' }}
                  />
                  Voir la requête utilisée
                </button>
              )}
            </div>
            {showSql && res.sql && (
              <pre
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 10,
                  overflowX: 'auto',
                  color: 'var(--text-2)',
                  margin: 0,
                }}
              >
                {res.sql}
              </pre>
            )}
          </div>
        )}

        <p style={{ fontSize: 11, color: 'var(--text-4)', margin: 0 }}>
          Le Pilote ne répond qu'à partir d'une requête réelle en lecture seule (jamais de chiffre
          inventé). Vérifie toujours un chiffre critique. Réservé à l'admin.
        </p>
      </div>
    </div>
  );
}
