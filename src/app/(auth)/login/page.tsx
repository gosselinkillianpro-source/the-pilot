import { cookies } from 'next/headers';
import { SWITCH_COOKIE } from '../switch-cookie';
import { LoginForm } from './login-form';

export const metadata = { title: 'Connexion — THE PILOT' };

export default async function LoginPage() {
  // Email pré-rempli après un « changer de compte » (cookie éphémère, jamais dans l'URL).
  const store = await cookies();
  const prefillEmail = store.get(SWITCH_COOKIE)?.value ?? '';
  return <LoginForm prefillEmail={prefillEmail} />;
}
