'use client';

import { Menu, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';

/** Sur mobile, la sidebar devient un tiroir ; le setter arrive souvent depuis le lien Telegram sur son téléphone. */
export function MobileNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="icon-btn mobile-only"
        aria-label="Menu"
        onClick={() => setOpen(true)}
      >
        <Menu />
      </button>
      {open ? (
        <div className="mobile-only" style={{ display: 'contents' }}>
          <button
            type="button"
            className="drawer-overlay"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
          />
          <div style={{ position: 'fixed', inset: '0 auto 0 0', zIndex: 50 }}>{children}</div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              top: 12,
              left: 'min(300px, 86vw)',
              zIndex: 60,
              background: 'var(--surface)',
            }}
          >
            <X />
          </button>
        </div>
      ) : null}
    </>
  );
}
