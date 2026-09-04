'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Clé de persistance locale — lue aussi par le script anti-flash du RootLayout. */
export const THEME_STORAGE_KEY = 'pilot-theme';

type Theme = 'light' | 'dark';

/**
 * Interrupteur jour / nuit. Le thème vit sur <html data-theme> : le script
 * inline du RootLayout l'applique avant la peinture (pas de flash), ce bouton
 * le bascule et le persiste. `null` avant montage : on ne devine pas côté
 * serveur, l'icône apparaît une fois le vrai thème connu.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Stockage indisponible (navigation privée…) : le thème vaut pour la session.
    }
  }

  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      title={isDark ? 'Mode clair (soleil levant)' : 'Mode sombre (lune qui se couche)'}
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        background: 'transparent',
        border: '1px solid var(--border)',
        color: 'var(--text-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {theme === null ? null : isDark ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
