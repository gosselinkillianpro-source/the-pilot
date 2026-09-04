import 'server-only';
import { optionalEnv } from '@/lib/env';

/**
 * Bot Telegram : le canal qui atteint vraiment le portable du setter. Gratuit,
 * instantané, un lien cliquable vers la fiche. Sans TELEGRAM_BOT_TOKEN, aucune
 * notification n'est envoyée et rien ne casse (le déploiement ne dépend pas
 * d'un réglage externe).
 */
const API = 'https://api.telegram.org';

export type TelegramResult = { ok: true } | { ok: false; error: string };

export function isTelegramConfigured(): boolean {
  return Boolean(optionalEnv('TELEGRAM_BOT_TOKEN'));
}

export async function sendTelegram(chatId: string, html: string): Promise<TelegramResult> {
  const token = optionalEnv('TELEGRAM_BOT_TOKEN');
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN absent' };
  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { description?: string } | null;
    return { ok: false, error: body?.description ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'échec réseau' };
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
