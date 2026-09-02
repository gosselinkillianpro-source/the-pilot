import 'server-only';

import {
  AD_CODE_LABELS,
  type AdPlatform,
  getAttributedCounts,
  getRdvManualCounts,
} from '@/lib/db/queries/ads-acquisition';
import { assembleBlended, type BlendedAcquisition } from './blended-math';
import { type AdsPeriod, periodToRange } from './period';

/**
 * Coût d'acquisition « réel », croisé Meta/Google + SAH.
 *
 * Trois voies d'attribution, sans double compte :
 *   1. CODE BONUS saisi à l'inscription (SEVEN-BREACH → Meta, BREACH-VIP → Google) ;
 *   2. RDV CALENDLY : les pubs n'orientent que vers la prise de RDV — toute
 *      personne vue en RDV sans autre origine connue (code, parrainage, CGP)
 *      est attribuée aux ads ;
 *   3. ATTRIBUTION MANUELLE (table ad_attributions) : décision humaine explicite.
 *
 * On ne garde QUE la dépense pub de chaque régie (leur seul chiffre fiable) et on la
 * divise par les VRAIS comptages SAH — pas par les conversions gonflées du pixel.
 */
export type {
  BlendedAcquisition,
  BlendedMetrics,
  ExtraAcq,
  PlatformAcq,
} from './blended-math';

/**
 * @param spendByPlatform dépense pub de la période par régie (depuis overview.byPlatform).
 */
export async function getBlendedAcquisition(
  period: AdsPeriod,
  spendByPlatform: Partial<Record<AdPlatform, number>>,
): Promise<BlendedAcquisition> {
  const range = periodToRange(period);
  const [counts, extraCounts] = await Promise.all([
    getAttributedCounts(range),
    getRdvManualCounts(range),
  ]);
  return assembleBlended(spendByPlatform, counts, extraCounts, AD_CODE_LABELS);
}
