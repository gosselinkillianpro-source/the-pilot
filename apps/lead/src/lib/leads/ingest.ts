import 'server-only';
import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import { hashIp } from '@/lib/crypto/hash';
import { campaigns, leadEvents, leads, type sources } from '@/lib/db/schema';
import { asSystem, type Tx } from '@/lib/db/session';
import { DEDUPE_WINDOW_DAYS } from '@/lib/domain/dedupe';
import {
  type AnswersPatch,
  hasUsableAttribution,
  type IngestPayload,
  ingestPayloadSchema,
} from '@/lib/domain/ingest-schema';
import { normalizePhone } from '@/lib/domain/phone';
import type { LeadState } from '@/lib/domain/state-machine';
import { addMinutes, isWithinServiceHours, nextServiceOpening } from '@/lib/domain/time';
import { enqueueJob } from '@/lib/jobs/queue';

/**
 * Module A — réception d'un lead (section 4.1).
 *
 * Tout se passe dans UNE transaction système : validation, normalisation,
 * idempotence, résolution de campagne, dédoublonnage, insertion, journal,
 * jobs (alerte, SMS hors service, escalades SLA, événement CAPI Lead).
 * Le webhook répond en moins de 500 ms ; l'immédiat part juste après via
 * runJobsNow(), le tick à la minute est le filet de sécurité.
 */
export type SourceRow = typeof sources.$inferSelect;

export type IngestMeta = { ip: string | null; userAgent: string | null; receivedAt: Date };

export type IngestResult =
  | { status: 'created'; leadId: string; state: LeadState; jobIds: string[] }
  | { status: 'already_exists'; leadId: string; state: LeadState }
  | { status: 'rejected'; reason: string; details?: unknown };

const SLA_SECOND_ESCALATION_MIN = 30;

function platformFromUtm(
  utmSource: string | null | undefined,
): 'meta' | 'google' | 'organic' | 'other' {
  const s = (utmSource ?? '').toLowerCase();
  if (['meta', 'facebook', 'fb', 'instagram', 'ig'].includes(s)) return 'meta';
  if (['google', 'adwords', 'gads'].includes(s)) return 'google';
  if (s === 'organic') return 'organic';
  return 'other';
}

async function resolveCampaign(tx: Tx, sourceId: string, p: IngestPayload): Promise<string | null> {
  const a = p.attribution;
  const platform = a.fbclid && !a.utm_campaign ? 'meta' : platformFromUtm(a.utm_source);
  const name =
    a.utm_campaign?.trim() || (platform === 'organic' ? 'Organique' : '(sans utm_campaign)');
  const adset = a.utm_content?.trim() ?? '';
  const ad = a.utm_term?.trim() ?? '';
  const inserted = await tx
    .insert(campaigns)
    .values({ sourceId, platform, name, adsetName: adset, adName: ad })
    .onConflictDoNothing({
      target: [campaigns.sourceId, campaigns.name, campaigns.adsetName, campaigns.adName],
    })
    .returning({ id: campaigns.id });
  if (inserted[0]) return inserted[0].id;
  const existing = await tx
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.sourceId, sourceId),
        eq(campaigns.name, name),
        eq(campaigns.adsetName, adset),
        eq(campaigns.adName, ad),
      ),
    )
    .limit(1);
  return existing[0]?.id ?? null;
}

export async function findLeadByIdempotency(
  sourceId: string,
  idempotencyKey: string,
): Promise<{ id: string; state: LeadState } | null> {
  const rows = await asSystem((tx) =>
    tx
      .select({ id: leads.id, state: leads.state })
      .from(leads)
      .where(and(eq(leads.sourceId, sourceId), eq(leads.idempotencyKey, idempotencyKey)))
      .limit(1),
  );
  return rows[0] ?? null;
}

export async function ingestLead(
  source: SourceRow,
  raw: unknown,
  meta: IngestMeta,
): Promise<IngestResult> {
  const parsed = ingestPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: 'rejected', reason: 'payload_invalide', details: parsed.error.flatten() };
  }
  const p = parsed.data;
  if (p.source !== source.code) {
    return { status: 'rejected', reason: 'source_incoherente' };
  }
  const phone = normalizePhone(p.phone);
  if (!phone.ok) {
    return { status: 'rejected', reason: 'telephone_invalide' };
  }
  if (!hasUsableAttribution(p.attribution)) {
    return { status: 'rejected', reason: 'attribution_absente' };
  }

  return asSystem(async (tx) => {
    const existing = await tx
      .select({ id: leads.id, state: leads.state })
      .from(leads)
      .where(and(eq(leads.sourceId, source.id), eq(leads.idempotencyKey, p.idempotency_key)))
      .limit(1);
    if (existing[0])
      return { status: 'already_exists', leadId: existing[0].id, state: existing[0].state };

    const campaignId = await resolveCampaign(tx, source.id, p);

    // Dédoublonnage : même téléphone, même source, 30 jours.
    const since = new Date(meta.receivedAt.getTime() - DEDUPE_WINDOW_DAYS * 24 * 3600 * 1000);
    const previous = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          eq(leads.sourceId, source.id),
          eq(leads.phoneE164, phone.e164),
          gt(leads.receivedAt, since),
          isNull(leads.deletedAt),
          ne(leads.state, 'hors_cible'),
        ),
      )
      .orderBy(desc(leads.receivedAt))
      .limit(1);
    const duplicateOf = previous[0]?.id ?? null;
    const state: LeadState = duplicateOf ? 'hors_cible' : 'a_rappeler';

    const inserted = await tx
      .insert(leads)
      .values({
        sourceId: source.id,
        firstName: p.first_name,
        lastName: p.last_name ?? null,
        phoneE164: phone.e164,
        email: p.email ?? null,
        locale: p.locale ?? 'fr-FR',
        answers: p.answers,
        answersVersion: p.answers_version ?? null,
        answersCompletedAt: p.answers_complete ? meta.receivedAt : null,
        siteScore: p.site_score ?? null,
        consentText: p.consent.text,
        consentVersion: p.consent.version ?? null,
        consentAt: p.consent.at,
        consentIpHash: hashIp(p.consent.ip ?? meta.ip),
        consentUserAgent: p.consent.user_agent ?? meta.userAgent,
        consentPartnerTransfer: p.consent.partner_transfer ?? true,
        utmSource: p.attribution.utm_source ?? null,
        utmMedium: p.attribution.utm_medium ?? null,
        utmCampaign: p.attribution.utm_campaign ?? null,
        utmContent: p.attribution.utm_content ?? null,
        utmTerm: p.attribution.utm_term ?? null,
        fbclid: p.attribution.fbclid ?? null,
        fbc: p.attribution.fbc ?? null,
        fbp: p.attribution.fbp ?? null,
        landingUrl: p.attribution.landing_url ?? null,
        referrer: p.attribution.referrer ?? null,
        pagePath: p.attribution.page ?? null,
        campaignId,
        receivedAt: meta.receivedAt,
        state,
        stateChangedAt: meta.receivedAt,
        stateReason: duplicateOf ? 'doublon' : null,
        dedupeOf: duplicateOf,
        idempotencyKey: p.idempotency_key,
        rawPayload: raw,
      })
      .returning({ id: leads.id });
    const leadId = inserted[0]?.id;
    if (!leadId) throw new Error('insertion du lead sans identifiant');

    await tx.insert(leadEvents).values({
      leadId,
      actorType: 'system',
      fromState: 'nouveau',
      toState: state,
      kind: duplicateOf ? 'duplicate' : 'received',
      payload: duplicateOf ? { dedupe_of: duplicateOf } : { campaign_id: campaignId },
      at: meta.receivedAt,
    });

    const jobIds: string[] = [];
    const push = (id: string | null) => {
      if (id) jobIds.push(id);
    };

    if (!duplicateOf) {
      const tz = source.defaultTimezone;
      const open = isWithinServiceHours(meta.receivedAt, source.serviceHours, tz);
      const opening = open
        ? meta.receivedAt
        : (nextServiceOpening(meta.receivedAt, source.serviceHours, tz) ?? meta.receivedAt);

      push(
        await enqueueJob(tx, {
          kind: 'lead.alert',
          payload: { leadId, offHours: !open },
          runAt: opening,
          idempotencyKey: `lead.alert:${leadId}`,
        }),
      );
      if (!open) {
        push(
          await enqueueJob(tx, {
            kind: 'lead.off_hours_sms',
            payload: { leadId, opening: opening.toISOString() },
            idempotencyKey: `lead.off_hours_sms:${leadId}`,
          }),
        );
      }
      // Escalades : depuis la réception (ou l'ouverture si reçu hors service).
      push(
        await enqueueJob(tx, {
          kind: 'lead.sla_escalate',
          payload: { leadId, level: 1 },
          runAt: addMinutes(opening, source.slaAlertMin),
          idempotencyKey: `lead.sla:${leadId}:1`,
        }),
      );
      push(
        await enqueueJob(tx, {
          kind: 'lead.sla_escalate',
          payload: { leadId, level: 2 },
          runAt: addMinutes(opening, SLA_SECOND_ESCALATION_MIN),
          idempotencyKey: `lead.sla:${leadId}:2`,
        }),
      );
    }
    // Événement Lead vers Meta, même pour un doublon (coût réel de la campagne).
    push(
      await enqueueJob(tx, {
        kind: 'capi.send',
        payload: { leadId, eventName: 'Lead', clientIp: meta.ip, clientUserAgent: meta.userAgent },
        idempotencyKey: `capi:Lead:${leadId}`,
      }),
    );

    return { status: 'created', leadId, state, jobIds };
  });
}

export type PatchResult = { status: 'updated'; leadId: string } | { status: 'not_found' };

/** `PATCH /api/v1/leads/{id}/answers` : les réponses arrivent après les coordonnées (sauvegarde progressive). */
export async function patchLeadAnswers(
  sourceId: string,
  leadId: string,
  patch: AnswersPatch,
  now = new Date(),
): Promise<PatchResult> {
  return asSystem(async (tx) => {
    const rows = await tx
      .select({ id: leads.id, answers: leads.answers, completedAt: leads.answersCompletedAt })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.sourceId, sourceId), isNull(leads.deletedAt)))
      .limit(1);
    const current = rows[0];
    if (!current) return { status: 'not_found' };
    const merged = { ...current.answers, ...patch.answers };
    await tx
      .update(leads)
      .set({
        answers: merged,
        answersVersion: patch.answers_version ?? undefined,
        answersCompletedAt: patch.answers_complete
          ? (current.completedAt ?? now)
          : current.completedAt,
        siteScore: patch.site_score ?? undefined,
      })
      .where(eq(leads.id, leadId));
    await tx.insert(leadEvents).values({
      leadId,
      actorType: 'system',
      kind: 'answers_updated',
      payload: { keys: Object.keys(patch.answers), complete: patch.answers_complete ?? false },
      at: now,
    });
    return { status: 'updated', leadId };
  });
}
