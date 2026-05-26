import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/db/types';

export type UserRole = 'admin' | 'closer' | 'closer_junior' | 'executive';

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: UserRole;
};

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
