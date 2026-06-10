import 'server-only';

import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { investors, subscriptions } from '@/lib/db/schema';

/**
 * ROI réel pub -> investisseurs.
 *
 * Relie une campagne (investors.acquisition_campaign_id, renseigné par SAH) aux
 * investisseurs réellement générés et au capital investi (souscriptions non annulées).
 * Tant que SAH ne renseigne pas l'origine d'acquisition, la map est vide => état "en attente".
 *
 * Lecture seule. Agrégats uniquement (aucune donnée personnelle exposée).
 */

export type CampaignRoi = { investors: number; invested: number };

export type RoiData = {
  hasAttribution: boolean;
  byCampaign: Map<string, CampaignRoi>;
  totalInvestors: number;
  totalInvested: number;
};

const EMPTY: RoiData = {
  hasAttribution: false,
  byCampaign: new Map(),
  totalInvestors: 0,
  totalInvested: 0,
};

export async function getCampaignRoi(): Promise<RoiData> {
  try {
    const rows = await db
      .select({
        campaignId: investors.acquisitionCampaignId,
        investorCount: sql<number>`count(distinct ${investors.id})`,
        invested: sql<number>`coalesce(sum(case when ${subscriptions.status} <> 'cancelled' then ${subscriptions.amount} else 0 end), 0)`,
      })
      .from(investors)
      .leftJoin(subscriptions, eq(subscriptions.investorId, investors.id))
      .where(and(isNotNull(investors.acquisitionCampaignId), isNull(investors.deletedAt)))
      .groupBy(investors.acquisitionCampaignId);

    const byCampaign = new Map<string, CampaignRoi>();
    let totalInvestors = 0;
    let totalInvested = 0;
    for (const r of rows) {
      if (!r.campaignId) continue;
      const investorsCount = Number(r.investorCount) || 0;
      const invested = Number(r.invested) || 0;
      byCampaign.set(r.campaignId, { investors: investorsCount, invested });
      totalInvestors += investorsCount;
      totalInvested += invested;
    }

    return {
      hasAttribution: byCampaign.size > 0,
      byCampaign,
      totalInvestors,
      totalInvested,
    };
  } catch {
    return EMPTY;
  }
}
