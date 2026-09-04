import { notFound } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth';
import { getCallQueue, type QueueRow } from '@/lib/db/queries/call-queue';
import { getSessionLeads } from '@/lib/db/queries/closer-day';
import { SessionClient, type SessionLead } from './session-client';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toSessionLead(r: QueueRow): SessionLead {
  return {
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    phone: r.phone,
    city: r.city,
    isBreach: r.isBreach,
    totalInvested: r.totalInvested,
    priority: r.scored.priority,
    temperature: r.scored.temperature,
    temperatureLabel: r.scored.temperatureLabel,
    statusLabel: r.scored.statusLabel,
    queueLabel: r.scored.queueLabel,
    callGoal: r.scored.callGoal,
    factors: r.scored.factors,
    missedAttempts: r.followUp?.missedAttempts ?? 0,
  };
}

/**
 * Le mode appel : une personne à la fois.
 *
 * Sans paramètre, l'ordre est celui du poste du jour (réservés, actions dues,
 * pool avec les pubs d'abord, base sans action). Avec `?lead=<id>`, une seule
 * personne : c'est le bouton « Résultat » d'Aujourd'hui ou de Mes clients.
 */
export default async function CallSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string; from?: string }>;
}) {
  const [sp, user] = await Promise.all([searchParams, getAuthenticatedUser()]);
  if (!['admin', 'closer', 'closer_junior'].includes(user.role)) notFound();

  const exitHref = sp.from?.startsWith('/closing/') ? sp.from : '/closing/aujourdhui';

  let rows: QueueRow[];
  if (sp.lead && UUID_RE.test(sp.lead)) {
    // Une seule personne : avec son suivi (tentatives), pour proposer la bonne suite.
    rows = await getCallQueue({ investorId: sp.lead, withFollowUp: true });
  } else {
    rows = await getSessionLeads(user.id);
  }
  // Une session ne doit JAMAIS proposer une personne réservée par un collègue :
  // c'est le double-appel assuré. Le verrou expiré est déjà remis à null.
  const available = rows.filter((r) => r.claimedById == null || r.claimedById === user.id);

  return <SessionClient leads={available.map(toSessionLead)} exitHref={exitHref} />;
}
