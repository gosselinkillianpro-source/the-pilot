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

export type AdCampaign = MetaCampaign | GoogleAdsCampaign;

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
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    results: number;
    cpaBlended: number | null;
    activeCount: number;
  };
  anyConfigured: boolean;
};

async function loadMeta(): Promise<PlatformState> {
  const cfg = getMetaConfig();
  if (!cfg.configured) {
    return { platform: 'Meta', configured: false, ok: false, reason: cfg.reason, campaigns: [] };
  }
  try {
    const campaigns = await fetchMetaCampaigns('this_month');
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

async function loadGoogle(): Promise<PlatformState> {
  const cfg = getGoogleAdsConfig();
  if (!cfg.configured) {
    return { platform: 'Google', configured: false, ok: false, reason: cfg.reason, campaigns: [] };
  }
  try {
    const campaigns = await fetchGoogleAdsCampaigns('THIS_MONTH');
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

/** Charge Meta + Google en parallèle et agrège les totaux. */
export async function getAdsOverview(): Promise<AdsOverview> {
  const [meta, google] = await Promise.all([loadMeta(), loadGoogle()]);
  const platforms = [meta, google];
  const campaigns = platforms.flatMap((p) => p.campaigns);

  const spend = campaigns.reduce((s, c) => s + c.spend, 0);
  const impressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const clicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const results = campaigns.reduce((s, c) => s + c.results, 0);
  const activeCount = campaigns.filter((c) => c.status === 'active').length;

  return {
    platforms,
    campaigns: campaigns.sort((a, b) => b.spend - a.spend),
    totals: {
      spend,
      impressions,
      clicks,
      results,
      cpaBlended: results > 0 ? spend / results : null,
      activeCount,
    },
    anyConfigured: platforms.some((p) => p.configured),
  };
}
