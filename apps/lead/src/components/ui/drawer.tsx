'use client';

import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

/**
 * Panneau latéral droit (« Customer Profile » des maquettes). Fermeture par
 * Échap, clic sur le voile ou la croix. `closeHref` = où revenir (URL sans le
 * paramètre du panneau) pour que l'état vive dans l'URL.
 */
export function Drawer({
  title,
  closeHref,
  openHref,
  children,
  footer,
}: {
  title: ReactNode;
  closeHref: string;
  openHref?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.push(closeHref);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeHref, router]);

  return (
    <>
      <button
        type="button"
        className="drawer-overlay"
        aria-label="Fermer"
        onClick={() => router.push(closeHref)}
      />
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-header">
          <span style={{ color: 'var(--text-4)', letterSpacing: 2 }}>⋮⋮</span>
          <span style={{ flex: 1 }}>{title}</span>
          {openHref ? (
            <a href={openHref} className="icon-btn" title="Ouvrir en pleine page">
              ↗
            </a>
          ) : null}
          <button
            type="button"
            className="icon-btn"
            onClick={() => router.push(closeHref)}
            aria-label="Fermer"
          >
            <X />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? <div className="drawer-footer">{footer}</div> : null}
      </aside>
    </>
  );
}
