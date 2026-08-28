import 'server-only';
import { SYNC_CHANNEL, type SyncTopic } from './topics';

/**
 * Émet le signal « quelque chose a changé » vers les autres écrans ouverts.
 *
 * Passe par l'API HTTP de Supabase Realtime plutôt que par une connexion
 * WebSocket : les server actions tournent en serverless, une socket ouverte n'y
 * survivrait pas à la requête. Un POST, 202, terminé.
 *
 * ⚠️ Le message ne porte AUCUNE donnée métier (voir `topics.ts`). Les clients
 * qui le reçoivent redemandent la page au serveur, qui applique les droits.
 *
 * ⚠️ Jamais bloquant : si Realtime est indisponible, la mutation a déjà eu
 * lieu et les autres écrans se rattraperont au rafraîchissement de secours.
 * Une notification ratée ne doit pas faire échouer une action de closer.
 */
export async function notifyChange(topic: SyncTopic): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ topic: SYNC_CHANNEL, event: topic, payload: {} }],
      }),
      // Le signal n'a de valeur que tout de suite : on ne le met pas en cache
      // et on ne laisse pas une requête lente retenir la réponse du closer.
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      console.warn(`[realtime] signal "${topic}" refusé (HTTP ${res.status})`);
    }
  } catch (e) {
    console.warn(`[realtime] signal "${topic}" non émis :`, e instanceof Error ? e.message : e);
  }
}
