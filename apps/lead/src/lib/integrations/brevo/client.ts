import 'server-only';
import { optionalEnv } from '@/lib/env';

const BASE = 'https://api.brevo.com/v3';

export function isBrevoConfigured(): boolean {
  return Boolean(optionalEnv('BREVO_API_KEY'));
}

export async function brevoPost<T>(path: string, body: unknown): Promise<T> {
  const key = optionalEnv('BREVO_API_KEY');
  if (!key) throw new Error('BREVO_API_KEY manquante');
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'api-key': key, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo ${res.status} sur ${path} : ${text.slice(0, 300)}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}
