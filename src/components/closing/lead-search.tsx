'use client';

import { Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { searchLeadsAction } from '@/lib/closing/lead-search';

type LeadResult = Awaited<ReturnType<typeof searchLeadsAction>>[number];

/**
 * Recherche d'un lead, présente sur toutes les pages closing (montée dans le layout closing).
 * Tape un nom, prénom, email ou téléphone → résultats cliquables vers la fiche.
 */
export function LeadSearch() {
  const pathname = usePathname();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<LeadResult[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Recherche débattue (250 ms) dès 2 caractères.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setPending(false);
      return;
    }
    setPending(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchLeadsAction(term);
        setResults(r);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setPending(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Fermeture au clic extérieur.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const from = encodeURIComponent(pathname?.startsWith('/closing') ? pathname : '/closing/queue');
  const showDropdown = open && q.trim().length >= 2;

  return (
    <div ref={boxRef} style={{ position: 'relative', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}
      >
        <Search size={15} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (q.trim().length >= 2) setOpen(true);
          }}
          placeholder="Chercher un lead — nom, prénom, email, téléphone…"
          aria-label="Chercher un lead"
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            background: 'none',
            outline: 'none',
            fontSize: 14,
            color: 'var(--text-1)',
          }}
        />
        {q ? (
          <button
            type="button"
            onClick={() => {
              setQ('');
              setResults([]);
              setOpen(false);
            }}
            aria-label="Effacer"
            style={{
              display: 'inline-flex',
              padding: 2,
              border: 'none',
              background: 'none',
              color: 'var(--text-4)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={15} />
          </button>
        ) : null}
      </div>

      {showDropdown ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 40,
            background: 'var(--surface-1, var(--surface-2))',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            overflow: 'hidden',
            maxHeight: '60vh',
            overflowY: 'auto',
          }}
        >
          {pending && results.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-3)' }}>
              Recherche…
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-3)' }}>
              Aucun lead trouvé.
            </div>
          ) : (
            results.map((r) => (
              <Link
                key={r.id}
                href={`/closing/investor/${r.id}?from=${from}`}
                onClick={() => setOpen(false)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  padding: '10px 14px',
                  textDecoration: 'none',
                  borderBottom: '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                  {r.fullName ?? r.email}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-3)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {[r.email, r.phone, r.city].filter(Boolean).join(' · ')}
                </span>
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
