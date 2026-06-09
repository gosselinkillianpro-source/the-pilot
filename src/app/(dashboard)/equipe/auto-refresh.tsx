'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Rafraîchit la page à intervalle régulier pour garder la présence à jour. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
