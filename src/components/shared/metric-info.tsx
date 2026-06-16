'use client';

import { Info } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { getMetric, SOURCE_LABELS } from '@/lib/metrics/catalogue';

/**
 * Provenance au clic (Phase 3 — confiance visible).
 * Enrobe la valeur d'une métrique : un ⓘ ouvre sa fiche du catalogue
 * (définition · source · calcul · décision). Réponse en un clic à « c'est le mélange de quoi ? ».
 *
 * Si l'id n'est pas dans le catalogue → on n'affiche que la valeur (dégradation propre).
 */
export function MetricInfo({ id, children }: { id: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const m = getMetric(id);

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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

      {open && m ? (
        <>
          {/* Voile cliquable pour fermer. */}
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 60,
              background: 'transparent',
              border: 'none',
              cursor: 'default',
            }}
          />
          <div
            role="dialog"
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              zIndex: 61,
              width: 320,
              maxWidth: '85vw',
              background: 'var(--surface-1, var(--surface-2))',
              border: '1px solid var(--border)',
              borderRadius: 10,
              boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
              padding: 12,
              textAlign: 'left',
              whiteSpace: 'normal',
              cursor: 'auto',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>
              {m.label}
            </div>
            <FicheRow label="Définition" value={m.definition} />
            <FicheRow label="Source" value={`${SOURCE_LABELS[m.source]} — ${m.sourceDetail}`} />
            <FicheRow label="Calcul" value={m.calcul} mono />
            <FicheRow label="Décision" value={m.decision} />
          </div>
        </>
      ) : null}
    </span>
  );
}

function FicheRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ marginBottom: 7 }}>
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
          fontSize: 12,
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
