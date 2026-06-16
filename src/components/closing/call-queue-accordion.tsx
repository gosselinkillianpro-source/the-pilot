'use client';

import { ChevronDown } from 'lucide-react';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';

/**
 * Accordéon de la file d'appels, contrôlé par React (une seule section ouverte).
 *
 * - L'état d'ouverture est mémorisé dans sessionStorage et restauré au retour depuis
 *   une fiche : le closer garde sa section ouverte (plus de reset sur « Nouveau 7 jours »)
 *   et sa position de défilement.
 * - React possède l'attribut `open` (via le contexte) → pas de course à l'hydratation,
 *   pas de dépendance à l'accordéon natif `<details name>` (support navigateur partiel).
 * - Les corps de section sont passés en `children` (motif supporté pour du contenu
 *   serveur contenant des îlots client comme « Je prends ») — surtout PAS en prop.
 *
 * Clé par `source` (BREACH / Tous / Hors BREACH) pour ne pas mélanger les onglets.
 */

type AccordionCtx = { openBucket: number | null; toggle: (bucket: number) => void };
const Ctx = createContext<AccordionCtx | null>(null);

export function QueueAccordion({
  source,
  firstBucket,
  children,
}: {
  source: string;
  firstBucket: number | null;
  children: ReactNode;
}) {
  const key = `closing-queue:${source}`;
  const [openBucket, setOpenBucket] = useState<number | null>(firstBucket);
  const restored = useRef(false);

  // Restaurer la section ouverte + le scroll, une seule fois au montage.
  // biome-ignore lint/correctness/useExhaustiveDependencies: restauration unique.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const main = document.querySelector<HTMLElement>('.app-main');
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const saved = JSON.parse(raw) as { bucket: number | null; mainTop: number; winTop: number };
      if (typeof saved.bucket === 'number') setOpenBucket(saved.bucket);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (main && saved.mainTop) main.scrollTop = saved.mainTop;
          if (saved.winTop) window.scrollTo(0, saved.winTop);
        }),
      );
    } catch {
      // sessionStorage indisponible — on ignore.
    }
  }, []);

  // Sauvegarder (section + scroll) au changement de section et au défilement.
  useEffect(() => {
    const main = document.querySelector<HTMLElement>('.app-main');
    const save = () => {
      try {
        sessionStorage.setItem(
          key,
          JSON.stringify({
            bucket: openBucket,
            mainTop: main?.scrollTop ?? 0,
            winTop: window.scrollY,
          }),
        );
      } catch {
        // ignore
      }
    };
    save();
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        save();
        ticking = false;
      });
    };
    const targets: Array<Window | HTMLElement> = main ? [main, window] : [window];
    for (const t of targets) t.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', save);
    return () => {
      for (const t of targets) t.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', save);
    };
  }, [openBucket, key]);

  const toggle = (bucket: number) => setOpenBucket((cur) => (cur === bucket ? null : bucket));

  return <Ctx.Provider value={{ openBucket, toggle }}>{children}</Ctx.Provider>;
}

export function QueueSection({
  bucket,
  label,
  goal,
  count,
  children,
}: {
  bucket: number;
  label: string;
  goal: string;
  count: number;
  children: ReactNode;
}) {
  const ctx = useContext(Ctx);
  const open = ctx?.openBucket === bucket;
  // Pas de <details open> (React ne met pas fiablement à jour cet attribut) : un bouton
  // + un corps masqué par `display`, 100% piloté par l'état React → exclusivité fiable.
  return (
    <div className="view-card" style={{ scrollMarginTop: 16 }}>
      <button
        type="button"
        className="view-card-header"
        onClick={() => ctx?.toggle(bucket)}
        style={{
          cursor: 'pointer',
          alignItems: 'center',
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          font: 'inherit',
          color: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <ChevronDown
            size={16}
            style={{
              color: 'var(--text-4)',
              flexShrink: 0,
              transform: open ? 'none' : 'rotate(-90deg)',
              transition: 'transform 0.15s ease',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <div className="view-card-title">{label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{goal}</div>
          </div>
        </div>
        <span className="badge badge-neutral">{count.toLocaleString('fr-FR')}</span>
      </button>
      <div className="view-card-body" style={{ padding: 0, display: open ? 'block' : 'none' }}>
        {children}
      </div>
    </div>
  );
}
