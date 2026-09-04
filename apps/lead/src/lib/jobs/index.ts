import 'server-only';
import { registerAppointmentJobs } from './handlers/appointment';
import { registerCapiJobs } from './handlers/capi';
import { registerLeadJobs } from './handlers/lead';
import { registeredKinds } from './queue';

let registered = false;

/** Enregistre tous les handlers, une seule fois par process. À appeler avant runDueJobs / runJobsNow. */
export function ensureJobsRegistered(): void {
  if (registered) return;
  registerLeadJobs();
  registerCapiJobs();
  registerAppointmentJobs();
  registered = true;
}

export function jobKinds(): string[] {
  ensureJobsRegistered();
  return registeredKinds();
}
