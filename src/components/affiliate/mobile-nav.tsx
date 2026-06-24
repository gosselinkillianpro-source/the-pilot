'use client';

import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AffiliateNav } from '@/components/affiliate/nav';
import { UserMenu } from '@/components/shared/user-menu';

/**
 * Navigation mobile de l'espace affilié : burger + drawer accessible.
 * Réplique le comportement du MobileNav staff (Échap, overlay, fermeture au changement
 * de route, scroll lock, piège de focus) en réutilisant les mêmes classes CSS.
 */
export function AffiliateMobileNav({
  role,
  name,
  initials,
}: {
  role: string;
  name: string;
  initials: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const drawerRef = useRef<HTMLElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: on ferme volontairement le drawer à chaque changement de route
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) {
      document.body.classList.add('drawer-open');
      drawerRef.current?.focus();
    } else {
      document.body.classList.remove('drawer-open');
    }
    return () => document.body.classList.remove('drawer-open');
  }, [open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      btnRef.current?.focus();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }

  return (
    <div className="mobile-drawer-root">
      <button
        ref={btnRef}
        type="button"
        className="burger-btn"
        aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
        aria-expanded={open}
        aria-controls="affiliate-mobile-drawer"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      <div
        className="mobile-drawer-overlay"
        data-open={open}
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />

      <aside
        id="affiliate-mobile-drawer"
        ref={drawerRef}
        className="mobile-drawer"
        data-open={open}
        aria-hidden={!open}
        aria-label="Navigation espace affilié"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <AffiliateNav />
        <div style={{ marginTop: 'auto', paddingTop: 12 }}>
          <UserMenu name={name} role={role} initials={initials} />
        </div>
      </aside>
    </div>
  );
}
