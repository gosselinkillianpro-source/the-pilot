'use client';

import { Download, X } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { exportLeadsCsvAction } from '@/app/(app)/leads/actions';
import { Button } from '@/components/ui/button';
import { StatePill } from '@/components/ui/pill';
import { useToast } from '@/components/ui/toast';
import { labelFor } from '@/lib/domain/answers/mep';
import { formatPhoneForDisplay } from '@/lib/domain/phone';
import { formatParis } from '@/lib/domain/time';
import type { LeadListItem } from '@/lib/leads/queries';

/**
 * Tableau des leads : sélection multiple + barre d'actions flottante (maquette).
 * Clic sur une ligne = fiche dans le panneau latéral (paramètre `lead` dans l'URL).
 */
export function LeadsTable({
  items,
  baseHref,
  isAdmin,
}: {
  items: LeadListItem[];
  baseHref: string;
  isAdmin: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const toast = useToast();
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  }
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportCsv() {
    start(async () => {
      const r = await exportLeadsCsvAction([...selected]);
      if (!r.ok) {
        toast.push(r.error, 'error');
        return;
      }
      const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.push(`${selected.size} lead(s) exporté(s). Export journalisé.`);
      setSelected(new Set());
    });
  }

  const sep = baseHref.includes('?') ? '&' : '?';

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Tout sélectionner"
                />
              </th>
              <th>Lead</th>
              <th>Campagne</th>
              <th>Montant</th>
              <th>Objectif</th>
              <th>Timing</th>
              <th>Statut</th>
              <th>Acheteur</th>
              <th>Reçu</th>
              <th>Rappel</th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id} className={selected.has(l.id) ? 'selected' : undefined}>
                <td>
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={selected.has(l.id)}
                    onChange={() => toggle(l.id)}
                    aria-label={`Sélectionner ${l.firstName}`}
                  />
                </td>
                <td className="primary">
                  <Link href={`${baseHref}${sep}lead=${l.id}`} className="row-link" scroll={false}>
                    {l.firstName}
                    <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
                      {formatPhoneForDisplay(l.phoneE164)}
                    </span>
                  </Link>
                </td>
                <td className="muted">{l.campaignName ?? '—'}</td>
                <td>{labelFor('montant', l.answers.montant)}</td>
                <td className="muted">{labelFor('objectif', l.answers.objectif)}</td>
                <td className="muted">{labelFor('urgence', l.answers.urgence)}</td>
                <td>
                  <StatePill state={l.state} />
                </td>
                <td className="muted">{l.buyerName ?? '—'}</td>
                <td className="muted num">{formatParis.dateTime(l.receivedAt)}</td>
                <td className="muted num">
                  {l.slaMinutesEffective !== null ? `${l.slaMinutesEffective} min` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected.size ? (
        <div className="floating-bar">
          <span>Sélection : {selected.size}</span>
          <span className="sep" />
          {isAdmin ? (
            <button type="button" onClick={exportCsv} disabled={pending}>
              <Download /> Exporter CSV
            </button>
          ) : null}
          <span className="sep" />
          <button type="button" className="discard" onClick={() => setSelected(new Set())}>
            <X /> Annuler
          </button>
        </div>
      ) : null}
      {pending ? (
        <Button variant="ghost" size="sm" disabled>
          Export…
        </Button>
      ) : null}
    </>
  );
}
