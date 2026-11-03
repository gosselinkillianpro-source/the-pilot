import { logAudit } from '@/lib/audit';
import { getApiUserOrNull } from '@/lib/auth';
import { getClubDeal } from '@/lib/club-deal';

/**
 * Export CSV des manifestations d'intérêt (« ; », UTF-8 avec BOM : Excel + import Brevo).
 * PROTÉGÉ : passe par le mur de connexion (seul /api/club-deal exact est public)
 * et revérifie le rôle ici (défense en profondeur). Admin uniquement : export de données perso.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  const user = await getApiUserOrNull();
  if (!user) return new Response('Non connecté', { status: 401 });
  if (user.role !== 'admin') return new Response('Accès refusé', { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const q = url.searchParams.get('q');
  const body = await getClubDeal().exportCsv({ status, q });

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'club_deal.export',
    resourceType: 'club_deal_interests',
    resourceId: 'csv',
    metadata: { status, q },
  });

  const day = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="club-deal-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
