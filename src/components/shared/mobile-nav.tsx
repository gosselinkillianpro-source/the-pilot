'use client';

import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { NavContent } from '@/components/shared/nav-content';
import { UserMenu } from '@/components/shared/user-menu';

/**
 * Navigation mobile : bouton burger + drawer accessible (§9 du document responsive).
 * - burger 44×44, aria-expanded / aria-controls ;
 * - fermeture : Échap, clic overlay, clic sur un lien (changement de route), bouton ;
 * - scroll lock du body, piège de focus simple, retour du focus au burger.
 */
export function MobileNav({
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

  // Ferme à chaque changement de route (l'utilisateur a cliqué un lien).
  // biome-ignore lint/correctness/useExhaustiveDependencies: on relance volontairement l'effet à chaque changement de route pour fermer le drawer
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Scroll lock + focus à l'ouverture.
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
        aria-controls="mobile-drawer"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: fermeture clavier gérée par Échap sur le drawer ; l'overlay est un raccourci souris non essentiel */}
      <div
        className="mobile-drawer-overlay"
        data-open={open}
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />

      <aside
        id="mobile-drawer"
        ref={drawerRef}
        className="mobile-drawer"
        data-open={open}
        aria-hidden={!open}
        aria-label="Navigation principale"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <NavContent role={role} />
        <div style={{ marginTop: 'auto', paddingTop: 12 }}>
          <UserMenu name={name} role={role} initials={initials} />
        </div>
      </aside>
    </div>
  );
}
