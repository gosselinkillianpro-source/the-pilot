'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

/** Petit bouton « copier » (numéro, email…) avec feedback visuel 1,5 s. */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard indisponible (contexte non sécurisé) — on ignore silencieusement
        }
      }}
      title={`Copier ${label ?? 'la valeur'}`}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copié' : (label ?? 'Copier')}
    </button>
  );
}
