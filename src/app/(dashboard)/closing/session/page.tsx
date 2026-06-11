import { notFound } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth';
import { getCallQueue } from '@/lib/db/queries/call-queue';
import { SessionClient, type SessionLead } from './session-client';

export const dynamic = 'force-dynamic';

export default async function CallSessionPage() {
  const user = await getAuthenticatedUser();
  if (!['admin', 'closer', 'closer_junior'].includes(user.role)) notFound();

  const queue = await getCallQueue({ excludeWon: true });
  const leads: SessionLead[] = queue.slice(0, 60).map((r) => ({
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
