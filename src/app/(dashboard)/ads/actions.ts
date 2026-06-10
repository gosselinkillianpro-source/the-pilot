'use server';

import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { buildAdsAlerts, rankCampaigns } from '@/lib/ads/analytics';
import { derive, getAdsOverview, rawOf } from '@/lib/ads/overview';
import { resolveAdsPeriod } from '@/lib/ads/period';
import { ANTHROPIC_MODELS, anthropic, estimateCostEur } from '@/lib/ai/anthropic';
import { logLlmCall } from '@/lib/ai/log-llm';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';

const schema = z.object({
  period: z.string().trim().max(40).optional(),
  from: z.string().trim().max(20).optional(),
  to: z.string().trim().max(20).optional(),
});

export type AdsRecoResult =
  | { ok: true; reco: string; costEur: number }
  | { ok: false; message: string };

const SYSTEM = `Tu es « le Pilote », expert en acquisition payante (Meta & Google Ads) pour Seven At Home,
plateforme d'investissement immobilier en club deal privé (cadre AMF strict).
On te fournit des CHIFFRES RÉELS de campagnes sur une période donnée.

Ta mission : donner 2 à 4 recommandations CONCRÈTES et actionnables, en français, en liste à puces courtes.
Pour chaque reco : quoi faire + pourquoi (en t'appuyant sur un chiffre fourni).

RÈGLES ABSOLUES :
- Base-toi UNIQUEMENT sur les chiffres fournis. N'invente aucune donnée ni aucune campagne.
- Si une info manque (ex. revenus réels / investisseurs générés), dis-le au lieu de supposer.
- Tu CONSEILLES, tu n'exécutes rien et tu ne dépenses rien : c'est l'humain qui décide.
- Ne qualifie jamais un rendement de « garanti » ; si tu parles d'une créa, reste conforme AMF.
- Sois direct et utile, pas de remplissage.`;

function buildSummary(label: string, overviewJson: string): string {
  return `Période : ${label}\n\nDonnées agrégées (JSON) :\n${overviewJson}`;
}

/** Le Pilote analyse les Ads de la période et propose des actions (lecture seule, admin/exec). */
export async function adsRecommendationAction(input: {
  period?: string;
  from?: string;
  to?: string;
}): Promise<AdsRecoResult> {
  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(input);
  } catch {
    return { ok: false, message: 'Paramètres invalides.' };
  }
  const user = await getAuthenticatedUser();
  try {
    await requireRole(user, ['admin', 'executive']);
  } catch {
    return { ok: false, message: "L'analyse du Pilote est réservée à l'admin et au gérant." };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, message: 'Clé IA absente (ANTHROPIC_API_KEY) dans l’environnement.' };
  }

  const period = resolveAdsPeriod(parsed);
  const overview = await getAdsOverview(period);

  if (overview.campaigns.length === 0) {
    return {
      ok: false,
      message:
        'Aucune donnée de campagne sur cette période — connecte Meta/Google ou élargis la période.',
    };
  }

  const ranking = rankCampaigns(overview.campaigns);
  const alerts = buildAdsAlerts(overview.campaigns, overview.totals.cpa);

  // Résumé chiffré compact (uniquement des agrégats de campagnes — aucune PII).
  const summaryObject = {
    totaux: {
      depense: Math.round(overview.totals.spend),
      impressions: overview.totals.impressions,
      clics: overview.totals.clicks,
      ctr: Number(overview.totals.ctr.toFixed(2)),
      cpc: overview.totals.cpc,
      resultats: overview.totals.results,
      coutParResultat: overview.totals.cpa,
      campagnesActives: overview.totals.activeCount,
    },
    parPlateforme: overview.byPlatform.map((b) => ({
      plateforme: b.platform,
      depense: Math.round(b.raw.spend),
      clics: b.raw.clicks,
      resultats: b.raw.results,
      coutParResultat: b.derived.cpa,
    })),
    campagnes: overview.campaigns.slice(0, 25).map((c) => {
      const d = derive(rawOf(c));
      return {
        plateforme: c.platform,
        nom: c.name,
        statut: c.status,
        depense: Math.round(c.spend),
        clics: c.clicks,
        ctr: Number(d.ctr.toFixed(2)),
        resultats: c.results,
        coutParResultat: d.cpa,
      };
    }),
    meilleures: ranking.best.map((x) => ({ nom: x.c.name, coutParResultat: Math.round(x.cpa) })),
    pires: ranking.worst.map((x) => ({ nom: x.c.name, coutParResultat: Math.round(x.cpa) })),
    budgetGaspille: ranking.wasted.map((c) => ({ nom: c.name, depense: Math.round(c.spend) })),
    alertes: alerts.map((a) => `${a.title} — ${a.detail}`),
  };

  const userMsg = buildSummary(period.label, JSON.stringify(summaryObject));
  const model = ANTHROPIC_MODELS.fast;
  const startedAt = Date.now();

  try {
    const resp = await anthropic.messages.create({
      model,
      max_tokens: 900,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    });
    const reco = resp.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('\n')
      .trim();

    const costEur = estimateCostEur(model, resp.usage.input_tokens, resp.usage.output_tokens);
    await logLlmCall({
      userId: user.id,
      model,
      purpose: 'ads_reco',
      promptTokens: resp.usage.input_tokens,
      completionTokens: resp.usage.output_tokens,
      latencyMs: Date.now() - startedAt,
      status: 'success',
      inputSummary: `ads reco ${period.label}`,
      outputSummary: reco.slice(0, 200),
    });
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'ai.ads_reco',
      resourceType: 'analytics',
      resourceId: 'ads',
      metadata: { period: period.label, campaigns: overview.campaigns.length },
    });

    return { ok: true, reco: reco || 'Pas de recommandation formulée.', costEur };
  } catch (e) {
    await logLlmCall({
      userId: user.id,
      model,
      purpose: 'ads_reco',
      status: 'error',
      errorMessage: e instanceof Error ? e.message : 'erreur',
      inputSummary: `ads reco ${period.label}`,
    });
    return { ok: false, message: e instanceof Error ? e.message : 'Erreur IA.' };
  }
}
