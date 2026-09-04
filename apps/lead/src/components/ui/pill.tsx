import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { type LeadState, STATE_LABELS } from '@/lib/domain/state-machine';

export type PillTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'dark';

export function Pill({
  tone = 'neutral',
  dot,
  children,
  className,
}: {
  tone?: PillTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn('pill', tone !== 'neutral' && `pill-${tone}`, dot && 'pill-dot', className)}
    >
      {children}
    </span>
  );
}

const STATE_TONES: Record<LeadState, PillTone> = {
  nouveau: 'info',
  a_rappeler: 'brand',
  en_appel: 'warning',
  qualifie: 'success',
  rdv_pose: 'success',
  a_rappeler_plus_tard: 'info',
  a_nourrir: 'neutral',
  hors_cible: 'neutral',
  injoignable: 'danger',
  honore: 'success',
  absent: 'danger',
  reprogramme: 'info',
  conforme: 'success',
  non_conforme: 'danger',
  retour_accepte: 'warning',
  retour_refuse: 'neutral',
  en_cours: 'info',
  signe: 'dark',
  perdu: 'neutral',
};

export function StatePill({ state }: { state: LeadState }) {
  return <Pill tone={STATE_TONES[state]}>{STATE_LABELS[state]}</Pill>;
}
