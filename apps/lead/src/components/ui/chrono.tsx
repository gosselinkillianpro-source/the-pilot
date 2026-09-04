'use client';

import { useEffect, useState } from 'react';
import { formatMinutesAgo, type SlaColor, slaColor } from '@/lib/domain/sla';

/**
 * Chrono de rappel. Tant que le lead n'est pas appelé, il avance en direct
 * (minute par minute) ; une fois `first_call_at` fixé, il est figé sur le
 * délai effectif. Le calcul de départ vient du serveur (heures de service).
 */
export function Chrono({
  minutesAtRender,
  frozen,
  targetMin,
  alertMin,
  prefix = 'reçu ',
}: {
  minutesAtRender: number;
  frozen: boolean;
  targetMin: number;
  alertMin: number;
  prefix?: string;
}) {
  const [renderedAt] = useState(() => Date.now());
  const [now, setNow] = useState(renderedAt);
  useEffect(() => {
    if (frozen) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [frozen]);
  const minutes = frozen ? minutesAtRender : minutesAtRender + (now - renderedAt) / 60000;
  const color: SlaColor = slaColor(minutes, targetMin, alertMin);
  return (
    <span
      className={`chrono ${color}`}
      title={frozen ? 'Délai de rappel effectif' : 'Temps d’attente (heures de service)'}
    >
      {frozen ? `rappelé en ${Math.round(minutes)} min` : `${prefix}${formatMinutesAgo(minutes)}`}
    </span>
  );
}
