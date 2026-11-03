/**
 * Adaptateur Web (Request → Response) pour le Route Handler Next.js.
 * Séparé de la route pour être testé en HTTP sans démarrer Next.
 */
import { clientIp, MAX_BODY } from './core';
import type { ClubDeal, HttpOut } from './service';

const toResponse = (out: HttpOut): Response =>
  new Response(out.status === 204 ? null : out.body, { status: out.status, headers: out.headers });

export function clubDealHandlers(clubDeal: Pick<ClubDeal, 'handleSubmit' | 'handleOptions'>) {
  return {
    OPTIONS: async (req: Request): Promise<Response> =>
      toResponse(clubDeal.handleOptions({ origin: req.headers.get('origin') })),
    // Corps lu BRUT : le widget envoie du JSON en text/plain, et sans JavaScript
    // le navigateur poste un formulaire urlencoded. Jamais de req.json() ici.
    POST: async (req: Request): Promise<Response> =>
      toResponse(
        await clubDeal.handleSubmit({
          // Corps annoncé trop gros : on ne le lit pas, réponse « Requête invalide » (JSON illisible).
          body: Number(req.headers.get('content-length')) > MAX_BODY ? '{' : await req.text(),
          contentType: req.headers.get('content-type'),
          ip: clientIp(req.headers.get('x-forwarded-for')),
          origin: req.headers.get('origin'),
          userAgent: req.headers.get('user-agent'),
        }),
      ),
  };
}
