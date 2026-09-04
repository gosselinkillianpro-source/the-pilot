/**
 * Chrono de rappel : vert < cible, orange entre cible et alerte, rouge au-delà.
 * Les seuils viennent de la source (5 / 10 minutes par défaut).
 */
export type SlaColor = 'green' | 'orange' | 'red';

export function slaColor(minutes: number, targetMin: number, alertMin: number): SlaColor {
  if (minutes < targetMin) return 'green';
  if (minutes < alertMin) return 'orange';
  return 'red';
}

/** « reçu il y a 3 min », « il y a 2 h », « il y a 3 j ». */
export function formatMinutesAgo(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 1) return 'à l’instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export function formatDurationMin(minutes: number | null): string {
  if (minutes === null) return '—';
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest.toString().padStart(2, '0')}` : `${h} h`;
}
