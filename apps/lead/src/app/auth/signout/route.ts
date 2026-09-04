import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/auth';

export async function POST(req: NextRequest): Promise<Response> {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url, { status: 303 });
}
