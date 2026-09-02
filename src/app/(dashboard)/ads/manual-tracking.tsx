'use client';

import { CalendarCheck2, Plus, Search, UserPlus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import type { AdAttributionRow, TrackCandidate } from '@/lib/db/queries/ad-attributions';
import {
  addTrackedPersonAction,
  removeTrackedPersonAction,
  searchTrackedCandidatesAction,
} from './tracking-actions';

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Carte « Tracking manuel » : rattacher à la main une personne aux ads BREACH
 * (ou à une campagne précise) pour que ses investissements comptent dans la
 * rentabilité pub, même sans code bonus ni RDV Calendly détecté.
 */
export function ManualTracking({
  rows,
  rdvAutoCount,
}: {
  rows: AdAttributionRow[];
  rdvAutoCount: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<TrackCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<TrackCandidate | null>(null);
  const [label, setLabel] = useState('BREACH');
  const [platform, setPlatform] = useState<'Meta' | 'Google' | ''>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recherche débouncée : on interroge le serveur 300 ms après la dernière frappe.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setCandidates([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const r = await searchTrackedCandidatesAction({ query: q });
      setSearching(false);
      if (r.ok) setCandidates(r.candidates);
      else toast(r.message, { variant: 'error' });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, toast]);

  function add() {
    if (!selected) return;
    startTransition(async () => {
      const r = await addTrackedPersonAction({
        investorId: selected.investorId,
        label: label.trim() || 'BREACH',
        platform: platform === '' ? null : platform,
      });
      if (!r.ok) {
        toast(r.message, { variant: 'error' });
        return;
      }
      toast(`${selected.fullName ?? selected.email} est maintenant tracké(e).`, {
        variant: 'success',
      });
      setSelected(null);
      setQuery('');
      setCandidates([]);
      setLabel('BREACH');
      setPlatform('');
      router.refresh();
    });
  }

  function remove(row: AdAttributionRow) {
    startTransition(async () => {
      const r = await removeTrackedPersonAction({ id: row.id });
      if (!r.ok) {
        toast(r.message, { variant: 'error' });
        return;
      }
      toast(`Attribution retirée pour ${row.fullName ?? row.email}.`, { variant: 'success' });
      router.refresh();
    });
  }

  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UserPlus size={16} />
          Tracking manuel — personnes attribuées aux ads
        </div>
        <span className="badge badge-neutral">{rows.length}</span>
      </div>
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>
          Ajoute ici quelqu'un que tu <strong>sais</strong> venir de la pub mais qu'aucun signal
          automatique ne capte. Ses investissements passent alors en « attribué certain » dans
          l'attribution honnête, et comptent dans le revenu attribué du bandeau vital.
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12.5,
            color: 'var(--text-3)',
            padding: '8px 10px',
            borderRadius: 8,
            background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)',
          }}
        >
          <CalendarCheck2 size={14} style={{ flexShrink: 0, color: 'var(--accent)' }} />
          <span>
            Déjà automatique : <strong>{rdvAutoCount}</strong> personne{rdvAutoCount > 1 ? 's' : ''}{' '}
            attribuée{rdvAutoCount > 1 ? 's' : ''} via un RDV Calendly (sans code, parrainage ni
            CGP). Pas besoin de les rajouter.
          </span>
        </div>

        {/* Recherche + sélection */}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={15} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              placeholder="Chercher une personne (nom ou email)…"
              style={{
                flex: 1,
                fontSize: 13,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text-1)',
              }}
            />
          </div>
          {query.trim().length >= 2 && !selected && (
            <div
              style={{
                marginTop: 6,
                border: '1px solid var(--border)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              {searching ? (
                <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--text-4)' }}>
                  Recherche…
                </div>
              ) : candidates.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--text-4)' }}>
                  Personne ne correspond dans la base SAH.
                </div>
              ) : (
                candidates.map((c) => (
                  <button
                    key={c.investorId}
                    type="button"
                    onClick={() => setSelected(c)}
                    disabled={c.alreadyTracked}
                    style={{
                      display: 'flex',
                      width: '100%',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '9px 12px',
                      fontSize: 13,
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
                      color: 'var(--text-1)',
                      cursor: c.alreadyTracked ? 'default' : 'pointer',
                      opacity: c.alreadyTracked ? 0.55 : 1,
                    }}
                  >
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <strong>{c.fullName ?? '—'}</strong>{' '}
                      <span style={{ color: 'var(--text-4)' }}>· {c.email}</span>
                    </span>
                    {c.alreadyTracked ? (
                      <span className="badge badge-neutral">déjà tracké</span>
                    ) : c.bonusCode ? (
                      <span className="badge badge-neutral">code {c.bonusCode}</span>
                    ) : (
                      <Plus size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Mini-formulaire d'attribution */}
        {selected && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
              background: 'color-mix(in srgb, var(--accent) 5%, transparent)',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
              {selected.fullName ?? selected.email}
            </span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="BREACH ou nom de campagne"
              maxLength={80}
              style={{
                fontSize: 12.5,
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text-1)',
                width: 200,
              }}
            />
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as 'Meta' | 'Google' | '')}
              style={{
                fontSize: 12.5,
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text-1)',
              }}
            >
              <option value="">Régie inconnue</option>
              <option value="Meta">Meta</option>
              <option value="Google">Google</option>
            </select>
            <button type="button" className="btn btn-sm" onClick={add} disabled={pending}>
              <Plus size={13} />
              {pending ? 'Ajout…' : 'Attribuer aux ads'}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setSelected(null)}
              disabled={pending}
            >
              Annuler
            </button>
          </div>
        )}

        {/* Liste des attributions manuelles */}
        {rows.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>
            Aucune attribution manuelle pour l'instant.
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
                  padding: '9px 2px',
                  borderBottom:
                    idx === rows.length - 1
                      ? 'none'
                      : '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                    {r.fullName ?? r.email}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>
                    {r.email} · ajouté le {r.createdAt.toLocaleDateString('fr-FR')}
                    {r.createdByName ? ` par ${r.createdByName}` : ''}
                  </div>
                </div>
                <span className="badge badge-neutral">
                  {r.label}
                  {r.platform ? ` · ${r.platform}` : ''}
                </span>
                <span
                  style={{
                    fontSize: 12.5,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    color: r.invested > 0 ? 'var(--success)' : 'var(--text-4)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.invested > 0 ? EUR.format(r.invested) : '0 €'}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => remove(r)}
                  disabled={pending}
                  aria-label={`Retirer l'attribution de ${r.fullName ?? r.email}`}
                  title="Retirer l'attribution"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
