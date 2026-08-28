import { eq } from 'drizzle-orm';
import { BellRing } from 'lucide-react';
import { getAuthenticatedUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import {
  MAX_LEAD_AGE_MINUTES,
  QUIET_HOURS_END,
  QUIET_HOURS_START,
} from '@/lib/leads/new-lead-alert';
import { isTelegramConfigured } from '@/lib/notifications/telegram';
import { TelegramForm } from './telegram-form';

export const dynamic = 'force-dynamic';

/**
 * « Mes alertes » — le closer branche son téléphone lui-même.
 *
 * Un lead rappelé dans les 5 minutes convertit bien mieux qu'un lead rappelé
 * le lendemain : encore faut-il savoir qu'il vient d'arriver sans avoir l'app
 * ouverte en permanence.
 */
export default async function AlertesPage() {
  const user = await getAuthenticatedUser();
  const rows = await db
    .select({ chatId: users.telegramChatId })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const chatId = rows[0]?.chatId ?? '';
  const botReady = isTelegramConfigured();

  return (
    <>
      <div>
        <h1 className="page-title">Mes alertes</h1>
        <div className="page-desc">
          Recevoir les nouveaux inscrits BREACH sur ton téléphone, avec le numéro à rappeler.
        </div>
      </div>

      {!botReady && (
        <div className="view-card">
          <div className="view-card-body" style={{ fontSize: 13, color: 'var(--warning)' }}>
            Le bot Telegram n'est pas encore configuré côté serveur (variable{' '}
            <code>TELEGRAM_BOT_TOKEN</code>). Tant qu'elle manque, aucune alerte ne part — le reste
            de l'app fonctionne normalement.
          </div>
        </div>
      )}

      <div className="view-card">
        <div className="view-card-header">
          <div>
            <div className="view-card-title">
              <BellRing size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              Canal Telegram
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 2 }}>
              {chatId ? 'Configuré — tu reçois les alertes.' : 'Non configuré — tu ne reçois rien.'}
            </div>
          </div>
          <span className={chatId ? 'badge badge-success' : 'badge badge-neutral'}>
            {chatId ? 'actif' : 'inactif'}
          </span>
        </div>
        <div className="view-card-body">
          <TelegramForm initial={chatId} />
        </div>
      </div>

      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Comment brancher son téléphone</div>
        </div>
        <div className="view-card-body">
          <ol style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.9, paddingLeft: 18 }}>
            <li>Installe Telegram sur ton téléphone (gratuit).</li>
            <li>
              Ouvre le bot de l'équipe et appuie sur <strong>Démarrer</strong>. Sans cette étape,
              Telegram interdit au bot de t'écrire.
            </li>
            <li>
              Écris à <strong>@userinfobot</strong> : il répond ton identifiant, une suite de
              chiffres.
            </li>
            <li>Colle-le ci-dessus, enregistre, puis envoie un test.</li>
          </ol>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.7 }}>
            Ce que tu recevras : nom, téléphone cliquable, ville, code apporteur et lien direct vers
            la fiche — de quoi rappeler sans ouvrir l'app.
            <br />
            Pas d'alerte entre <strong>{QUIET_HOURS_START} h</strong> et{' '}
            <strong>{QUIET_HOURS_END} h</strong> : personne ne décroche la nuit, et le lead reste
            dans la file pour le matin. Passé{' '}
            <strong>{Math.round(MAX_LEAD_AGE_MINUTES / 60)} h</strong>, une inscription ne fait plus
            sonner de téléphone.
          </div>
        </div>
      </div>
    </>
  );
}
