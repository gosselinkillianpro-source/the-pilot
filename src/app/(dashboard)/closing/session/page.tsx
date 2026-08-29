import { notFound } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth';
import { getCallQueue } from '@/lib/db/queries/call-queue';
import { SessionClient, type SessionLead } from './session-client';

export const dynamic = 'force-dynamic';

export default async function CallSessionPage() {
  const user = await getAuthenticatedUser();
  if (!['admin', 'closer', 'closer_junior'].includes(user.role)) notFound();

  const queue = await getCallQueue({ excludeWon: true });
  // À 4 closers en simultané, une session ne doit JAMAIS proposer un lead
  // qu'un collègue a « pris » : c'est le double-appel assuré. Le verrou expiré
  // est déjà remis à null par getCallQueue (TTL), donc le filtre est sûr.
  const available = queue.filter((r) => r.claimedById == null || r.claimedById === user.id);
  const leads: SessionLead[] = available.slice(0, 60).map((r) => ({
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
  }));

  return <SessionClient leads={leads} />;
}
