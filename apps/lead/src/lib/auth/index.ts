import { createServerClient } from '@supabase/ssr';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { users } from '@/lib/db/schema';
import { asSystem, type DbScope } from '@/lib/db/session';
import { isAuthDisabled } from './dev-bypass';

/**
 * Authentification : Supabase Auth du projet DÉDIÉ à The Pilot Lead.
 * Le compte doit porter `app_metadata.app = 'lead'` ET exister dans
 * `lead.users` — la table applicative est la source de vérité du rôle et
 * du périmètre (sources d'un setter, acheteur d'un buyer).
 */
export type UserRole = 'admin' | 'setter' | 'buyer';

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  sourceIds: string[];
  buyerId: string | null;
  onDuty: boolean;
  telegramChatId: string | null;
};

const DEV_LOCAL_USER: AuthenticatedUser = {
  id: '00000000-0000-0000-0000-000000000000',
  email: 'dev-local@thepilot.lead',
  name: 'Dev local',
  role: 'admin',
  sourceIds: [],
  buyerId: null,
  onDuty: true,
  telegramChatId: null,
};

export class AuthError extends Error {
  constructor(readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN') {
    super(code);
    this.name = 'AuthError';
  }
}

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
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
            // Server Components ne peuvent pas écrire les cookies — le proxy s'en charge.
          }
        },
      },
    },
  );
}

export async function loadAppUser(authUserId: string): Promise<AuthenticatedUser | null> {
  const rows = await asSystem((tx) =>
    tx.select().from(users).where(eq(users.id, authUserId)).limit(1),
  );
  const u = rows[0];
  if (!u?.active) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    sourceIds: u.sourceIds,
    buyerId: u.buyerId,
    onDuty: u.onDuty,
    telegramChatId: u.telegramChatId,
  };
}

/** Utilisateur courant, ou `null` si personne n'est connecté. */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  if (isAuthDisabled()) return DEV_LOCAL_USER;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  if (data.user.app_metadata?.app !== 'lead') return null;
  return loadAppUser(data.user.id);
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError('UNAUTHENTICATED');
  return user;
}

export async function requireRole(
  user: AuthenticatedUser,
  roles: readonly UserRole[],
): Promise<void> {
  if (!roles.includes(user.role)) throw new AuthError('FORBIDDEN');
}

/** Périmètre base de données de l'utilisateur (voir withDbSession). */
export function scopeFor(user: AuthenticatedUser): DbScope {
  switch (user.role) {
    case 'admin':
      return { role: 'admin', userId: user.id };
    case 'setter':
      return { role: 'setter', userId: user.id, sourceIds: user.sourceIds };
    case 'buyer':
      if (!user.buyerId) throw new AuthError('FORBIDDEN');
      return { role: 'buyer', userId: user.id, buyerId: user.buyerId };
  }
}

export function isStaff(user: AuthenticatedUser): boolean {
  return user.role === 'admin' || user.role === 'setter';
}

/** Un setter ne voit que ses sources ; un admin voit tout. */
export function canAccessSource(user: AuthenticatedUser, sourceId: string): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'setter') return user.sourceIds.includes(sourceId);
  return false;
}

export function homePathFor(role: UserRole): string {
  return role === 'buyer' ? '/acheteur' : '/';
}
