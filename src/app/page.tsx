import { redirect } from 'next/navigation';

/**
 * THE PILOT est un outil interne : la racine n'a pas de page d'accueil publique.
 * On renvoie directement vers le dashboard, qui redirige lui-même vers /login
 * si la session n'est pas authentifiée.
 */
export default function RootPage() {
  redirect('/dashboard');
}
