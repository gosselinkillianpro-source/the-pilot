'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SYNC_CHANNEL, type SyncTopic } from '@/lib/realtime/topics';

/**
 * Garde l'écran à jour quand un collègue travaille en même temps.
 *
 * Le serveur émet un signal nu (« le suivi des appels a changé »), ce composant
 * l'écoute et redemande la page. Aucune donnée ne transite par le canal : c'est
 * le rendu serveur qui recharge, avec les droits de l'utilisateur.
 *
 * Trois garde-fous, parce qu'un temps réel qui rafraîchit trop est pire que pas
 * de temps réel :
 *   · REGROUPEMENT — plusieurs signaux en rafale (un closer qui déplace trois
 *     cartes) ne déclenchent qu'un seul rechargement ;
 *   · ONGLET CACHÉ — on ne recharge pas une page que personne ne regarde ; le
 *     rattrapage se fait au retour sur l'onglet ;
 *   · FILET DE SÉCURITÉ — un rafraîchissement périodique couvre les cas où le
 *     WebSocket ne passe pas (réseau d'entreprise) et la synchro SAH horaire,
 *     qui modifie les données sans passer par une action de l'app.
 */

/** Regroupement des signaux : au-delà, on recharge une fois pour toutes. */
const BURST_MS = 400;
/** Filet de sécurité quand le direct ne passe pas. */
const FALLBACK_MS = 60_000;

export function LiveSync({
  topics,
  showBadge = false,
}: {
  topics: SyncTopic[];
  showBadge?: boolean;
}) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Les topics arrivent en littéral depuis les pages : on fige la liste pour ne
  // pas ré-abonner à chaque rendu.
  const key = topics.join(',');

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), BURST_MS);
    };

    const fallback = setInterval(refresh, FALLBACK_MS);
    // Au retour sur l'onglet, on rattrape ce qui s'est passé pendant l'absence.
    document.addEventListener('visibilitychange', refresh);

    if (!url || !anon) {
      return () => {
        clearInterval(fallback);
        document.removeEventListener('visibilitychange', refresh);
      };
    }

    const supabase = createBrowserClient(url, anon);
    const channel = supabase.channel(SYNC_CHANNEL);
    for (const topic of key.split(',')) {
      channel.on('broadcast', { event: topic }, refresh);
    }
    channel.subscribe((status) => setLive(status === 'SUBSCRIBED'));

    return () => {
      if (timer.current) clearTimeout(timer.current);
      clearInterval(fallback);
      document.removeEventListener('visibilitychange', refresh);
      supabase.removeChannel(channel);
    };
  }, [router, key]);

  if (!showBadge) return null;

  return (
    <span
      className="badge badge-neutral"
      title={
        live
          ? 'Les actions de tes collègues apparaissent ici sans recharger.'
          : 'Direct indisponible — la page se rafraîchit toute seule chaque minute.'
      }
      style={{ gap: 5 }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: live ? 'var(--success)' : 'var(--text-4)',
        }}
      />
      {live ? 'en direct' : 'différé'}
    </span>
  );
}
