import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/env';

/** Client Supabase avec la clé service (création de comptes, liens magiques). Serveur uniquement. */
export function getSupabaseAdminClient() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
