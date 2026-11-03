import { getClubDeal } from '@/lib/club-deal';
import { clubDealHandlers } from '@/lib/club-deal/http';

/**
 * Route PUBLIQUE du formulaire « club deal » de sevenathome.com.
 * Hors du mur de connexion (voir PUBLIC_PATHS dans src/lib/auth/session.ts) :
 * protégée par la validation, le pot de miel, le délai minimal et la limite par IP.
 * Répond toujours 200 avec { ok, ref } ou { ok:false, errors } (le widget lit ok/errors).
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function OPTIONS(req: Request): Promise<Response> {
  return clubDealHandlers(getClubDeal()).OPTIONS(req);
}

export function POST(req: Request): Promise<Response> {
  return clubDealHandlers(getClubDeal()).POST(req);
}
