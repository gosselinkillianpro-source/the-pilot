import 'server-only';

/**
 * Notifications Telegram — le canal qui atteint vraiment le portable.
 *
 * Choisi contre le SMS (payant, crédits à surveiller) et WhatsApp (app Meta,
 * numéro dédié, templates à faire approuver) : un bot Telegram est gratuit,
 * instantané, sans quota utile à notre volume, et se met en place en une fois.
 *
 * Mise en route, côté humain :
 *   1. créer le bot auprès de @BotFather, récupérer le token → TELEGRAM_BOT_TOKEN
 *   2. chaque closer démarre une conversation avec le bot (bouton « Démarrer »)
 *   3. il récupère son identifiant auprès de @userinfobot et le colle dans
 *      /equipe → l'alerte lui parvient dès l'inscription suivante
 *
 * Sans token configuré, l'app se comporte comme avant : aucune notification,
 * aucune erreur. C'est volontaire — le déploiement ne doit pas dépendre d'un
 * réglage externe.
 */

const API = 'https://api.telegram.org';

export type TelegramResult = { ok: true } | { ok: false; error: string };

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

/**
 * Envoie un message à une conversation.
 *
 * Ne lève jamais : une notification ratée ne doit pas faire échouer le travail
 * qui l'a déclenchée (une synchro, un appel enregistré). L'échec est retourné
 * pour être tracé par l'appelant.
 */
export async function sendTelegram(chatId: string, html: string): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN absent' };

  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        // L'aperçu du lien vers la fiche mangerait la moitié de l'écran et
        // masquerait le numéro à rappeler.
        link_preview_options: { is_disabled: true },
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) return { ok: true };

    // Telegram répond en JSON avec une description exploitable (chat inconnu,
    // bot bloqué par l'utilisateur, HTML invalide…). On la remonte telle quelle.
    const body = (await res.json().catch(() => null)) as { description?: string } | null;
    return { ok: false, error: body?.description ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'échec réseau' };
  }
}
