import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';

/**
 * Client Supabase « service » — côté serveur UNIQUEMENT.
 *
 * Il contourne la RLS et pilote Auth (création de comptes). Il ne sert qu'aux
 * opérations que l'utilisateur connecté n'a pas le droit de faire lui-même :
 * créer le compte d'une personne invitée, poser son rôle dans app_metadata.
 * Jamais importé par un composant client (le garde `server-only` le refuse).
 */
export function getSupabaseAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL manquante.');
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
