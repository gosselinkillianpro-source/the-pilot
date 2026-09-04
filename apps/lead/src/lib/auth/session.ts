import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { isAuthDisabled } from './dev-bypass';

/**
 * Proxy (middleware Next 16) : rafraîchit la session Supabase et pose le mur
 * de connexion. Tourne en edge runtime : aucun accès base ici, le rôle est lu
 * dans le JWT (app_metadata) ; la vérification fine (lead.users) est faite
 * dans les layouts et les server actions.
 */
const PUBLIC_PATHS = ['/login', '/login/acheteur', '/auth/callback', '/auth/signout'];

/** Endpoints appelés par des services externes ou par des liens signés : protégés par leur propre secret. */
const PUBLIC_PREFIXES = [
  '/api/v1/',
  '/api/cron/',
  '/api/webhooks/',
  '/v/',
  '/r/',
  '/c/',
  '/consentement/',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function updateSession(request: NextRequest) {
  if (isAuthDisabled()) return NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet)
          response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = '';
    return NextResponse.redirect(url);
  };

  const isLeadUser = user?.app_metadata?.app === 'lead';

  if (!user || !isLeadUser) {
    if (isPublicPath(pathname)) return response;
    return redirectTo('/login');
  }

  const role = (user.app_metadata?.role as string | undefined) ?? 'setter';

  // Connecté : les pages de connexion renvoient vers l'accueil du rôle.
  if (pathname === '/login' || pathname === '/login/acheteur') {
    return redirectTo(role === 'buyer' ? '/acheteur' : '/');
  }
  // Un acheteur ne sort jamais de son espace.
  if (role === 'buyer' && !pathname.startsWith('/acheteur') && !isPublicPath(pathname)) {
    return redirectTo('/acheteur');
  }
  return response;
}
