import 'server-only';

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { investors } from '@/lib/db/schema';
import { getBrevoAccount } from '@/lib/integrations/brevo/client';
import { getGoogleAdsConfig } from '@/lib/integrations/google-ads/client';
import { getMetaConfig } from '@/lib/integrations/meta-ads/client';
import { classifyFreshness, formatAgo, type SourceHealth } from './freshness';

/**
 * Probe l'état RÉEL de chaque connecteur de données. Honnête par construction :
 * - base SAH : fraîcheur = max(investors.updated_at) (dernière écriture de sync).
 * - Brevo : appel API live → ok/down/non configuré.
 * - Meta/Google : présence des clés (l'appel réel se fait sur /ads).
 * - GA4 / Calendly / WhatsApp : ANNONCÉS mais NON branchés → état explicite « non connecté ».
 *
 * Règle : jamais présenter une donnée figée comme fraîche. Une source en échec → état affiché.
 */

export async function probeSahDb(now: number = Date.now()): Promise<SourceHealth> {
  try {
    const rows = await db
      .select({
        last: sql<string | null>`max(${investors.updatedAt})`,
        n: sql<number>`count(*)::int`,
      })
      .from(investors);
    const last = rows[0]?.last ? new Date(rows[0].last) : null;
    const n = Number(rows[0]?.n) || 0;
    return {
      key: 'sah_db',
      label: 'Base Seven At Home',
      status: classifyFreshness(last, now),
      freshness: formatAgo(last, now),
      freshnessAt: last?.toISOString() ?? null,
      detail: `${n.toLocaleString('fr-FR')} investisseurs en miroir`,
    };
  } catch (e) {
    return {
      key: 'sah_db',
      label: 'Base Seven At Home',
      status: 'down',
      freshness: '—',
      freshnessAt: null,
      detail: e instanceof Error ? e.message : 'requête échouée',
    };
  }
}

async function probeBrevo(): Promise<SourceHealth> {
  const hasKey = Boolean(process.env.BREVO_API_KEY);
  try {
    const acc = await getBrevoAccount();
    return {
      key: 'brevo',
      label: 'Brevo',
      status: 'ok',
      freshness: 'temps réel (API)',
      freshnessAt: null,
      detail: acc?.companyName ? `compte ${acc.companyName}` : 'connecté',
    };
  } catch (e) {
    return {
      key: 'brevo',
      label: 'Brevo',
      status: hasKey ? 'down' : 'not_configured',
      freshness: '—',
      freshnessAt: null,
      detail: hasKey
        ? e instanceof Error
          ? e.message
          : 'API échouée'
        : 'clé BREVO_API_KEY absente',
    };
  }
}

function probeRegie(
  key: 'meta_ads' | 'google_ads',
  label: string,
  configured: boolean,
  reason?: string,
): SourceHealth {
  return {
    key,
    label,
    status: configured ? 'ok' : 'not_configured',
    freshness: configured ? 'temps réel (API)' : '—',
    freshnessAt: null,
    detail: configured ? 'clés présentes' : (reason ?? 'clés absentes'),
  };
}

function notConnected(key: SourceHealth['key'], label: string): SourceHealth {
  return {
    key,
    label,
    status: 'not_connected',
    freshness: '—',
    freshnessAt: null,
    detail: 'non branché (annoncé en roadmap, aucun code d’intégration)',
  };
}

/** État de santé de toutes les sources (parallèle, tolérant aux pannes). */
export async function probeAllSources(now: number = Date.now()): Promise<SourceHealth[]> {
  const meta = getMetaConfig();
  const google = getGoogleAdsConfig();
  const [sah, brevo] = await Promise.all([probeSahDb(now), probeBrevo()]);
  return [
    sah,
    brevo,
    probeRegie('meta_ads', 'Meta Ads', meta.configured, meta.configured ? undefined : meta.reason),
    probeRegie(
      'google_ads',
      'Google Ads',
      google.configured,
      google.configured ? undefined : google.reason,
    ),
    notConnected('ga4', 'Google Analytics 4'),
    notConnected('calendly', 'Calendly'),
    notConnected('whatsapp', 'WhatsApp'),
  ];
}
