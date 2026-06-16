'use client';

import { Info, X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getMetric, SOURCE_LABELS } from '@/lib/metrics/catalogue';

/**
 * Provenance au clic (Phase 3 — confiance visible).
 * Enrobe la valeur d'une métrique : un ⓘ ouvre sa fiche du catalogue
 * (définition · source · calcul · décision). Réponse en un clic à « c'est le mélange de quoi ? ».
 *
 * La fiche est une petite MODALE CENTRÉE portée dans `document.body` (createPortal) :
 * elle échappe à tout `overflow:hidden`/`transform` parent → responsive, jamais rognée.
 * Si l'id n'est pas dans le catalogue → on n'affiche que la valeur (dégradation propre).
 * Modale centrée responsive (portée dans body).
 */
export function MetricInfo({ id, children }: { id: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const m = getMetric(id);

  useEffect(() => setMounted(true), []);

  // Fermeture à la touche Échap + verrou du scroll de fond quand la modale est ouverte.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {children}
      {m ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={`Provenance : ${m.label}`}
          title="D'où vient ce chiffre ?"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 16,
            height: 16,
            padding: 0,
            border: 'none',
            background: 'none',
            color: open ? 'var(--brand)' : 'var(--text-4)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Info size={12} />
        </button>
      ) : null}

      {open && m && mounted
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Provenance : ${m.label}`}
              onClick={() => setOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                background: 'rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
              }}
            >
              <div
                // Empêche la fermeture quand on clique DANS la carte.
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 'min(360px, 92vw)',
                  maxHeight: '80vh',
                  overflowY: 'auto',
                  background: 'var(--surface-1, var(--surface-2))',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  boxShadow: '0 18px 48px rgba(0,0,0,0.3)',
                  padding: 16,
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                    {m.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Fermer"
                    style={{
                      display: 'inline-flex',
                      padding: 4,
                      border: 'none',
                      background: 'none',
                      color: 'var(--text-3)',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
                <FicheRow label="Définition" value={m.definition} />
                <FicheRow label="Source" value={`${SOURCE_LABELS[m.source]} — ${m.sourceDetail}`} />
                <FicheRow label="Calcul" value={m.calcul} mono />
                <FicheRow label="Décision" value={m.decision} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

function FicheRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          color: 'var(--text-4)',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12.5,
          lineHeight: 1.45,
          color: 'var(--text-2)',
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
          wordBreak: mono ? 'break-word' : 'normal',
        }}
      >
        {value}
      </div>
    </div>
  );
}
