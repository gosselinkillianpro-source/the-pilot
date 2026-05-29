import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

// Rôles qui exigent le 2FA (dupliqué ici volontairement : le middleware tourne
// en edge runtime, on évite d'importer le module auth complet — voir src/lib/auth/index.ts).
const MFA_REQUIRED_ROLES = ['admin', 'closer', 'closer_junior'];

// Routes accessibles sans être connecté.
const PUBLIC_PATHS = ['/', '/login', '/mfa', '/mfa/setup'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
}

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Pas de Supabase configuré (V0 dev sans .env.local) : le proxy est un no-op.
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
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

  // --- Non connecté ---
  if (!user) {
    if (isPublicPath(pathname)) return response;
    return redirectTo('/login');
  }

  // --- Connecté : on vérifie l'état du 2FA ---
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const currentLevel = aal?.currentLevel;
  const nextLevel = aal?.nextLevel;
  const role = (user.app_metadata?.role as string | undefined) ?? 'executive';
  const requiresMfa = MFA_REQUIRED_ROLES.includes(role);

  // Possède un facteur 2FA mais ne l'a pas encore validé cette session → vérification.
  const needsVerify = currentLevel === 'aal1' && nextLevel === 'aal2';
  // Aucun facteur 2FA et rôle qui l'exige → enrôlement obligatoire.
  const needsEnroll = currentLevel === 'aal1' && nextLevel === 'aal1' && requiresMfa;

  if (needsVerify) {
    return pathname === '/mfa' ? response : redirectTo('/mfa');
  }
  if (needsEnroll) {
    return pathname === '/mfa/setup' ? response : redirectTo('/mfa/setup');
  }

  // Pleinement authentifié (aal2, ou executive sans 2FA requis).
  // On le sort des écrans d'auth s'il y traîne encore.
  if (pathname === '/login' || pathname === '/mfa' || pathname === '/mfa/setup') {
    return redirectTo('/dashboard');
  }

  return response;
}
