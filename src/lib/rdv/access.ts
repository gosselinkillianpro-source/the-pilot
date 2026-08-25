import 'server-only';
import { asc, eq, inArray, isNull } from 'drizzle-orm';
import type { AuthenticatedUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { calendlyConnections, users } from '@/lib/db/schema';
import { getConnectionInfo, getValidAccessToken } from '@/lib/integrations/calendly/oauth';

/**
 * Qui voit quel agenda.
 *
 * Règle : la page RDV appartient au compte connecté. Un closer ne voit QUE son
 * propre agenda — c'est aussi une question de confidentialité, un agenda contient
 * les rendez-vous personnels du salarié.
 *
 * L'admin fait exception : il peut consulter l'agenda de n'importe quel closer
 * via `?closer=<id>`. Le contrôle est fait ici ET côté page (defense in depth) :
 * un closer qui forge l'URL avec l'id d'un collègue est ramené sur le sien.
 */

export type RdvTarget = {
  /** Le compte dont on affiche l'agenda. */
  userId: string;
  name: string | null;
  email: string;
  /** Vrai quand on regarde l'agenda de quelqu'un d'autre (vue admin). */
  isOtherUser: boolean;
};

export type RdvAccess =
  | { state: 'no_target'; reason: 'closer_introuvable' }
  | { state: 'not_connected'; target: RdvTarget }
  | { state: 'connected'; target: RdvTarget; accessToken: string; calendlyEmail: string }
  | { state: 'connection_broken'; target: RdvTarget; message: string };

/** Rôles autorisés à consulter l'agenda d'un autre. */
function canViewOthers(user: AuthenticatedUser): boolean {
  return user.role === 'admin';
}

/**
 * Résout l'agenda à afficher et le jeton pour le lire.
 *
 * `requestedCloserId` vient de l'URL. Il n'est honoré que pour un admin ;
 * sinon on retombe silencieusement sur le compte connecté.
 */
export async function resolveRdvAccess(
  user: AuthenticatedUser,
  requestedCloserId?: string,
): Promise<RdvAccess> {
  const wantsOther = Boolean(
    requestedCloserId && requestedCloserId !== user.id && canViewOthers(user),
  );
  const targetId = wantsOther && requestedCloserId ? requestedCloserId : user.id;

  const rows = await db
    .select({ id: users.id, fullName: users.fullName, email: users.email })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  const row = rows[0];
  if (!row) return { state: 'no_target', reason: 'closer_introuvable' };

  const target: RdvTarget = {
    userId: row.id,
    name: row.fullName,
    email: row.email,
    isOtherUser: targetId !== user.id,
  };

  const connection = await getConnectionInfo(targetId);
  if (!connection) return { state: 'not_connected', target };

  try {
    const token = await getValidAccessToken(targetId);
    if (!token) return { state: 'not_connected', target };
    return {
      state: 'connected',
      target,
      accessToken: token.accessToken,
      calendlyEmail: connection.calendlyEmail,
    };
  } catch (e) {
    // Le rafraîchissement a échoué : accès révoqué côté Calendly. On le dit
    // clairement plutôt que d'afficher un agenda vide qui ressemble à « pas de RDV ».
    return {
      state: 'connection_broken',
      target,
      message: e instanceof Error ? e.message : 'connexion Calendly invalide',
    };
  }
}

export type ConnectedCloser = {
  userId: string;
  name: string | null;
  email: string;
  calendlyEmail: string | null;
  connected: boolean;
};

/**
 * Les comptes dont l'admin peut consulter l'agenda : tout le staff susceptible
 * de prendre des RDV, avec l'état de sa connexion Calendly. Sert au sélecteur.
 */
export async function listRdvCloser(user: AuthenticatedUser): Promise<ConnectedCloser[]> {
  if (!canViewOthers(user)) return [];

  const staff = await db
    .select({ id: users.id, fullName: users.fullName, email: users.email })
    .from(users)
    .where(inArray(users.role, ['admin', 'closer', 'closer_junior']))
    .orderBy(asc(users.fullName));

  const conns = await db
    .select({
      userId: calendlyConnections.userId,
      calendlyEmail: calendlyConnections.calendlyEmail,
    })
    .from(calendlyConnections)
    .where(isNull(calendlyConnections.revokedAt));

  const byUser = new Map(conns.map((c) => [c.userId, c.calendlyEmail]));

  return staff.map((s) => ({
    userId: s.id,
    name: s.fullName,
    email: s.email,
    calendlyEmail: byUser.get(s.id) ?? null,
    connected: byUser.has(s.id),
  }));
}
