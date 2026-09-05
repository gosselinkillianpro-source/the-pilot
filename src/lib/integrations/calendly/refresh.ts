import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import type { AuthenticatedUser, UserRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { upsertRdvContacts } from '@/lib/db/queries/rdv-contacts';
import { calendlyConnections, users } from '@/lib/db/schema';
import { linkContactsToInvestors } from '@/lib/webinars/sync';
import { getValidAccessToken } from './oauth';
import { autoAssignRdvLeads, getRdvBoard } from './rdv';

/**
 * Rafraîchit les fiches des rendez-vous Calendly SANS attendre qu'un humain
 * ouvre la page /rdv (cron, toutes les 15 min).
 *
 * Pourquoi : quelqu'un qui a pris un RDV Calendly est déjà entre les mains de
 * Guillaume. Il ne doit jamais apparaître dans le pool des closers ni dans
 * l'alerte Telegram (décision Killian, 5 sept. 2026). L'exclusion s'appuie sur
 * `rdv_contacts` (source calendly) : il faut donc que la fiche existe dès la
 * réservation, pas seulement quand Guillaume ouvre son agenda.
 *
 * Pour chaque agenda relié en OAuth : lecture des RDV, fiches à jour,
 * attribution des leads orphelins au propriétaire de l'agenda (même règle
 * « collante » que le closing), puis rattachement par e-mail aux comptes SAH.
 * Best-effort : une erreur sur un agenda n'empêche ni les autres ni la synchro.
 */

export type CalendlyRefreshResult = {
  connections: number;
  contactsCreated: number;
  assigned: number;
  errors: string[];
};

export async function refreshCalendlyContacts(): Promise<CalendlyRefreshResult> {
  const result: CalendlyRefreshResult = {
    connections: 0,
    contactsCreated: 0,
    assigned: 0,
    errors: [],
  };

  const connections = await db
    .select({ userId: calendlyConnections.userId, email: users.email, role: users.role })
    .from(calendlyConnections)
    .innerJoin(users, eq(users.id, calendlyConnections.userId))
    .where(and(isNull(calendlyConnections.revokedAt), eq(users.active, true)));

  for (const c of connections) {
    result.connections += 1;
    try {
      const token = await getValidAccessToken(c.userId);
      if (!token) continue;
      const board = await getRdvBoard(token.accessToken);
      if (board.state !== 'ok') {
        if (board.state === 'error') result.errors.push(`${c.email} : ${board.message}`);
        continue;
      }
      result.contactsCreated += await upsertRdvContacts(
        board.board.rdvs.map((r) => ({
          email: r.email ?? '',
          fullName: r.lead,
          phone: r.phone,
          statut: r.statut,
          investorId: r.investorId,
        })),
        c.userId,
      );
      // L'audit est signé du propriétaire de l'agenda : c'est son attribution.
      const viewer: AuthenticatedUser = { id: c.userId, email: c.email, role: c.role as UserRole };
      const assign = await autoAssignRdvLeads(board.board, viewer, c.userId);
      result.assigned += assign.assigned;
    } catch (e) {
      result.errors.push(`${c.email} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  try {
    await linkContactsToInvestors();
  } catch (e) {
    result.errors.push(`rattachement : ${e instanceof Error ? e.message : String(e)}`);
  }
  return result;
}
