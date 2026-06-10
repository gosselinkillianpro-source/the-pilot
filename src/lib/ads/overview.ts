import 'server-only';

import {
  fetchGoogleAdsCampaigns,
  type GoogleAdsCampaign,
  getGoogleAdsConfig,
} from '@/lib/integrations/google-ads/client';
import {
  fetchMetaCampaigns,
  getMetaConfig,
  type MetaCampaign,
} from '@/lib/integrations/meta-ads/client';
import type { AdsPeriod } from './period';

export type AdCampaign = MetaCampaign | GoogleAdsCampaign;

/** Métriques brutes additionnables. */
export type RawMetrics = {
  spend: number;
  impressions: number;
  reach: number; // somme des portées connues (approx, non dédupliquée entre campagnes)
  clicks: number;
  results: number;
};

/** Métriques calculées à partir des brutes. */
export type DerivedMetrics = {
  ctr: number; // % clics / impressions
  cpc: number | null; // coût par clic
  cpm: number | null; // coût pour 1000 impressions
  cpa: number | null; // coût par résultat
  frequency: number | null; // impressions / portée (Meta uniquement)
};

export function derive(m: RawMetrics): DerivedMetrics {
  return {
    ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0,
    cpc: m.clicks > 0 ? m.spend / m.clicks : null,
    cpm: m.impressions > 0 ? (m.spend / m.impressions) * 1000 : null,
    cpa: m.results > 0 ? m.spend / m.results : null,
    frequency: m.reach > 0 ? m.impressions / m.reach : null,
  };
}

export function rawOf(c: AdCampaign): RawMetrics {
  return {
    spend: c.spend,
    impressions: c.impressions,
    reach: c.reach ?? 0,
    clicks: c.clicks,
    results: c.results,
  };
}

export type PlatformState = {
  platform: 'Meta' | 'Google';
  configured: boolean;
  ok: boolean; // configuré ET appel réussi
  reason?: string; // raison non-configuré, ou message d'erreur
  campaigns: AdCampaign[];
};

export type AdsOverview = {
  platforms: PlatformState[];
  campaigns: AdCampaign[];
  totals: RawMetrics & DerivedMetrics & { activeCount: number; hasReach: boolean };
  byPlatform: { platform: 'Meta' | 'Google'; raw: RawMetrics; derived: DerivedMetrics }[];
  anyConfigured: boolean;
};

async function loadMeta(period: AdsPeriod): Promise<PlatformState> {
  const cfg = getMetaConfig();
  if (!cfg.configured) {
    return { platform: 'Meta', configured: false, ok: false, reason: cfg.reason, campaigns: [] };
  }
  try {
    const campaigns = await fetchMetaCampaigns(period);
    return { platform: 'Meta', configured: true, ok: true, campaigns };
  } catch (e) {
    return {
      platform: 'Meta',
      configured: true,
      ok: false,
      reason: e instanceof Error ? e.message : 'Erreur Meta',
      campaigns: [],
    };
  }
}

async function loadGoogle(period: AdsPeriod): Promise<PlatformState> {
  const cfg = getGoogleAdsConfig();
  if (!cfg.configured) {
    return { platform: 'Google', configured: false, ok: false, reason: cfg.reason, campaigns: [] };
  }
  try {
    const campaigns = await fetchGoogleAdsCampaigns(period);
    return { platform: 'Google', configured: true, ok: true, campaigns };
  } catch (e) {
    return {
      platform: 'Google',
      configured: true,
      ok: false,
      reason: e instanceof Error ? e.message : 'Erreur Google Ads',
      campaigns: [],
    };
  }
}

function sumRaw(campaigns: AdCampaign[]): RawMetrics {
  return campaigns.reduce<RawMetrics>(
    (acc, c) => ({
      spend: acc.spend + c.spend,
      impressions: acc.impressions + c.impressions,
      reach: acc.reach + (c.reach ?? 0),
      clicks: acc.clicks + c.clicks,
      results: acc.results + c.results,
    }),
    { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0 },
  );
}

/** Charge Meta + Google en parallèle sur la période et agrège tout. */
export async function getAdsOverview(period: AdsPeriod): Promise<AdsOverview> {
  const [meta, google] = await Promise.all([loadMeta(period), loadGoogle(period)]);
  const platforms = [meta, google];
  const campaigns = platforms.flatMap((p) => p.campaigns).sort((a, b) => b.spend - a.spend);

  const totalsRaw = sumRaw(campaigns);
  const hasReach = campaigns.some((c) => c.reach !== null);

  const byPlatform = platforms
    .filter((p) => p.campaigns.length > 0)
    .map((p) => {
      const raw = sumRaw(p.campaigns);
      return { platform: p.platform, raw, derived: derive(raw) };
    });

  return {
    platforms,
    campaigns,
    totals: {
      ...totalsRaw,
      ...derive(totalsRaw),
      activeCount: campaigns.filter((c) => c.status === 'active').length,
      hasReach,
    },
    byPlatform,
    anyConfigured: platforms.some((p) => p.configured),
  };
}
