'use client';

import { Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import type { FixedCostRow } from '@/lib/db/queries/ad-fixed-costs';
import { addFixedCostAction, removeFixedCostAction } from './costs-actions';

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/** Saisie / liste des coûts fixes marketing (outils, créa, prestataires) par mois. */
export function FixedCostsEditor({ rows, canEdit }: { rows: FixedCostRow[]; canEdit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');

  function add() {
    const amountEur = Number(amount.replace(',', '.'));
    startTransition(async () => {
      const r = await addFixedCostAction({ month, label, amountEur });
      if (!r.ok) {
        toast(r.message, { variant: 'error' });
        return;
      }
      setLabel('');
      setAmount('');
      toast('Coût fixe ajouté.', { variant: 'success' });
      router.refresh();
    });
  }

  function remove(row: FixedCostRow) {
    startTransition(async () => {
      const r = await removeFixedCostAction({ id: row.id });
      if (!r.ok) {
        toast(r.message, { variant: 'error' });
        return;
      }
      toast(`« ${row.label} » supprimé.`, { variant: 'success' });
      router.refresh();
    });
  }

  const inputStyle = {
    fontSize: 12.5,
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    color: 'var(--text-1)',
  } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {canEdit ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={inputStyle}
            aria-label="Mois"
          />
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Outil, créa, prestataire…"
            maxLength={120}
            style={{ ...inputStyle, flex: '1 1 160px' }}
          />
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Montant €"
            style={{ ...inputStyle, width: 110 }}
          />
          <button
            type="button"
            className="btn btn-sm"
            onClick={add}
            disabled={pending || !label.trim() || !amount.trim()}
          >
            <Plus size={13} />
            Ajouter
          </button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>
          Aucun coût fixe saisi — le ROI complet est égal au ROAS média tant que rien n'est
          renseigné ici.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((r, idx) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 2px',
                borderBottom:
                  idx === rows.length - 1
                    ? 'none'
                    : '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
              }}
            >
              <span
                style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-4)' }}
              >
                {r.month}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-1)', flex: 1, minWidth: 0 }}>
                {r.label}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  color: 'var(--text-1)',
                }}
              >
                {EUR.format(r.amountEur)}
              </span>
              {canEdit ? (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => remove(r)}
                  disabled={pending}
                  aria-label={`Supprimer ${r.label}`}
                  title="Supprimer"
                >
                  <X size={13} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
