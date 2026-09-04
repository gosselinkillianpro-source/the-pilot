import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, loadAppUser } from '@/lib/auth';

/** Retour du lien magique : échange du code contre une session, puis redirection selon le rôle. */
export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code');
  const next = req.nextUrl.searchParams.get('next') ?? '/';
  const target = req.nextUrl.clone();
  target.search = '';
  if (!code) {
    target.pathname = '/login';
    return NextResponse.redirect(target);
  }
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user || data.user.app_metadata?.app !== 'lead') {
    target.pathname = '/login';
    return NextResponse.redirect(target);
  }
  const appUser = await loadAppUser(data.user.id);
  if (!appUser) {
    await supabase.auth.signOut();
    target.pathname = '/login';
    return NextResponse.redirect(target);
  }
  target.pathname = appUser.role === 'buyer' ? '/acheteur' : next.startsWith('/') ? next : '/';
  return NextResponse.redirect(target);
}
