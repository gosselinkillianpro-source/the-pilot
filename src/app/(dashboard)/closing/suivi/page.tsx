import { redirect } from 'next/navigation';

/**
 * Fusionnée dans le cockpit « Aujourd'hui » : les deux pages listaient les
 * mêmes `closer_tasks` avec le même bouton de complétion. Le formulaire de
 * qualification (`qualify-call.tsx`) y vit désormais, en première section.
 */
export default function SuiviRedirect() {
  redirect('/closing/today');
}
