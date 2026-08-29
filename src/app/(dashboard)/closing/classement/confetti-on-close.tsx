'use client';

import { useEffect, useState } from 'react';

/**
 * Confettis quand une souscription vient de tomber — impossible à rater.
 *
 * Le serveur passe l'identifiant du dernier événement « souscription closée ».
 * Chaque navigateur retient le dernier qu'il a vu (localStorage) : quand un
 * nouvel identifiant arrive (poussé par le signal temps réel qui recharge la
 * page), tous les écrans ouverts célèbrent. À la première visite, on mémorise
 * sans célébrer — on ne fête pas une vieille victoire.
 *
 * Zéro dépendance : des confettis en pur CSS, retirés du DOM à la fin.
 */

const STORAGE_KEY = 'pilot-last-celebrated-close';
const PIECES = 80;
const DURATION_MS = 3200;
const COLORS = ['#f59e0b', '#2563eb', '#10b981', '#ef4444', '#7c3aed', '#ec4899', '#eab308'];

type Piece = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
  drift: number;
  spin: number;
};

export function ConfettiOnClose({ latestCloseId }: { latestCloseId: string | null }) {
  const [pieces, setPieces] = useState<Piece[] | null>(null);

  useEffect(() => {
    if (!latestCloseId) return;
    let seen: string | null = null;
    try {
      seen = window.localStorage.getItem(STORAGE_KEY);
      window.localStorage.setItem(STORAGE_KEY, latestCloseId);
    } catch {
      // Stockage indisponible (navigation privée) : pas de confettis, pas de drame.
      return;
    }
    if (seen === null || seen === latestCloseId) return;

    setPieces(
      Array.from({ length: PIECES }, (_, id) => ({
        id,
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2 + Math.random() * 1.4,
        size: 6 + Math.random() * 7,
        color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? '#f59e0b',
        drift: (Math.random() - 0.5) * 240,
        spin: 360 + Math.random() * 720,
      })),
    );
    const timer = setTimeout(() => setPieces(null), DURATION_MS + 1500);
    return () => clearTimeout(timer);
  }, [latestCloseId]);

  if (!pieces) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 2000,
      }}
    >
      <style>{`
        @keyframes pilot-confetti-fall {
          0% { transform: translate3d(0, -5vh, 0) rotate(0deg); opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translate3d(var(--drift), 105vh, 0) rotate(var(--spin)); opacity: 0; }
        }
      `}</style>
      {pieces.map((p) => (
        <span
          key={p.id}
          style={
            {
              position: 'absolute',
              top: 0,
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.45,
              borderRadius: 2,
              background: p.color,
              '--drift': `${p.drift}px`,
              '--spin': `${p.spin}deg`,
              animation: `pilot-confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
