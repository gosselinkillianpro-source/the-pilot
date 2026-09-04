/**
 * Accès aux variables d'environnement. Une variable manquante est une erreur
 * explicite au moment où on en a besoin, jamais une chaîne vide silencieuse.
 */
export function optionalEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v : undefined;
}

export function requireEnv(name: string): string {
  const v = optionalEnv(name);
  if (!v)
    throw new Error(`Variable d’environnement manquante : ${name} (voir apps/lead/.env.example)`);
  return v;
}

export function appUrl(): string {
  return (optionalEnv('NEXT_PUBLIC_APP_URL') ?? 'http://localhost:3001').replace(/\/$/, '');
}

/** Mode test des envois : ACTIF par défaut, il faut écrire explicitement `false` pour envoyer en vrai. */
export function isEmailTestMode(): boolean {
  return optionalEnv('EMAIL_TEST_MODE') !== 'false';
}

export function isSmsTestMode(): boolean {
  return optionalEnv('SMS_TEST_MODE') !== 'false';
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
