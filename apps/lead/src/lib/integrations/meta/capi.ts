import 'server-only';
import { capiHashEmail, capiHashPhone } from '@/lib/crypto/hash';
import { optionalEnv } from '@/lib/env';

/**
 * Meta Conversions API (côté serveur) — section 4.7. Pixel / dataset de MEP.
 * Les identifiants sont hachés SHA-256 avant envoi, l'`event_id` permet à
 * Meta de dédupliquer avec le pixel navigateur, `event_time` est l'horodatage
 * réel de l'événement (pas celui de l'envoi).
 */
const GRAPH_VERSION = 'v21.0';

export type CapiEventName = 'Lead' | 'Schedule' | 'RDV_Honore' | 'RDV_Conforme' | 'Signe';

export type CapiEventInput = {
  eventName: CapiEventName;
  eventId: string;
  eventTime: Date;
  email?: string | null;
  phoneE164?: string | null;
  clientIp?: string | null;
  clientUserAgent?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  eventSourceUrl?: string | null;
  customData?: Record<string, string | number>;
};

export type CapiResult =
  | { ok: true; status: number; eventsReceived: number }
  | { ok: false; status: number | null; error: string; skipped?: boolean };

export function isCapiConfigured(): boolean {
  return Boolean(optionalEnv('META_PIXEL_ID') && optionalEnv('META_CAPI_ACCESS_TOKEN'));
}

/** Fenêtre acceptée par Meta pour un événement en temps réel : 7 jours. */
export const CAPI_MAX_AGE_DAYS = 7;

export function buildCapiEvent(input: CapiEventInput): Record<string, unknown> {
  const userData: Record<string, unknown> = {};
  if (input.email) userData.em = [capiHashEmail(input.email)];
  if (input.phoneE164) userData.ph = [capiHashPhone(input.phoneE164)];
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.clientUserAgent) userData.client_user_agent = input.clientUserAgent;
  if (input.fbc) userData.fbc = input.fbc;
  if (input.fbp) userData.fbp = input.fbp;
  const event: Record<string, unknown> = {
    event_name: input.eventName,
    event_time: Math.floor(input.eventTime.getTime() / 1000),
    event_id: input.eventId,
    action_source: 'website',
    user_data: userData,
  };
  if (input.eventSourceUrl) event.event_source_url = input.eventSourceUrl;
  if (input.customData && Object.keys(input.customData).length)
    event.custom_data = input.customData;
  return event;
}

export async function sendCapiEvent(input: CapiEventInput): Promise<CapiResult> {
  const pixelId = optionalEnv('META_PIXEL_ID');
  const token = optionalEnv('META_CAPI_ACCESS_TOKEN');
  if (!pixelId || !token) {
    return {
      ok: false,
      status: null,
      error: 'META_PIXEL_ID / META_CAPI_ACCESS_TOKEN absents',
      skipped: true,
    };
  }
  const body: Record<string, unknown> = { data: [buildCapiEvent(input)] };
  const testCode = optionalEnv('META_CAPI_TEST_EVENT_CODE');
  if (testCode) body.test_event_code = testCode;

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      events_received?: number;
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ok: false, status: res.status, error: json.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, eventsReceived: json.events_received ?? 0 };
  } catch (e) {
    return { ok: false, status: null, error: e instanceof Error ? e.message : String(e) };
  }
}
