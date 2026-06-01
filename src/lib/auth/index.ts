import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/db/types';
import { isAuthDisabled } from './dev-bypass';

// Utilisateur fictif utilisé UNIQUEMENT quand l'auth est désactivée en dev local.
const DEV_LOCAL_USER: AuthenticatedUser = {
  id: '00000000-0000-0000-0000-000000000000',
  email: 'dev-local@thepilot',
  role: 'admin',
};

export type UserRole = 'admin' | 'closer' | 'closer_junior' | 'executive';

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: UserRole;
};

/**
 * Rôles pour lesquels la double authentification (2FA / TOTP) est OBLIGATOIRE.
 * Règle de sécurité CLAUDE.md #5. Les `executive` peuvent l'activer mais ne sont
 * pas bloqués sans.
 */
export const MFA_REQUIRED_ROLES: readonly UserRole[] = ['admin', 'closer', 'closer_junior'];

export function roleRequiresMfa(role: UserRole): boolean {
  return MFA_REQUIRED_ROLES.includes(role);
}

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot mutate cookies — handled by middleware
          }
        },
      },
    },
  );
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  // DEV LOCAL : auth désactivée → admin fictif (jamais en prod, voir dev-bypass.ts).
  if (isAuthDisabled()) {
    return DEV_LOCAL_USER;
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error('UNAUTHENTICATED');
  }

  const role = (data.user.app_metadata?.role as UserRole | undefined) ?? 'executive';

  return {
    id: data.user.id,
    email: data.user.email ?? '',
    role,
  };
}

export async function requireRole(
  user: AuthenticatedUser,
  allowedRoles: UserRole[],
): Promise<void> {
  if (!allowedRoles.includes(user.role)) {
    throw new Error(`FORBIDDEN: role ${user.role} not in ${allowedRoles.join(',')}`);
  }
}

/**
 * Variante non bloquante pour les Route Handlers (/api) : renvoie l'utilisateur
 * authentifié ou `null`, sans lever d'exception. Permet de répondre proprement
 * un 401 au lieu d'un 500. Défense en profondeur en plus du middleware.
 */
export async function getApiUserOrNull(): Promise<AuthenticatedUser | null> {
  try {
    return await getAuthenticatedUser();
  } catch {
    return null;
  }
}
