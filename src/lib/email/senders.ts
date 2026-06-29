import 'server-only';
import { getBrevoSenders } from '@/lib/integrations/brevo/send';
import { type EmailSender, getAllowedSenders } from './config';

/**
 * Liste des expéditeurs disponibles = expéditeurs VALIDÉS dans Brevo (source de vérité).
 * Repli sur la liste env `EMAIL_SENDERS` (puis l'expéditeur par défaut) si Brevo est
 * injoignable. Read-only, best-effort : ne casse jamais une page/un envoi.
 */
export async function listSenders(): Promise<EmailSender[]> {
  try {
    const brevo = await getBrevoSenders();
    if (brevo.length > 0) return brevo.map((s) => ({ name: s.name, address: s.email }));
  } catch {
    // Brevo down / clé absente → repli env
  }
  return getAllowedSenders();
}
