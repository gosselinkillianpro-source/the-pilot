import { z } from 'zod';
import { MEP_ANSWERS_VERSION, splitContactFromFields } from './answers/mep';
import type { IngestPayload } from './ingest-schema';

/**
 * Adaptateur du payload NATIF du site MonExpertPatrimoine (lead-client.ts) vers
 * le payload canonique de la spec. Le site envoie son état à chaque étape
 * validée (sauvegarde progressive) : le premier envoi consenti crée le lead,
 * les suivants complètent ses réponses. `sessionId` sert de clé d'idempotence.
 *
 * Le site ne parle jamais directement à The Pilot Lead : le relais est fait
 * par /api/lead.php (même domaine que le site), qui ajoute la clé de source,
 * l'IP et le user-agent du visiteur en en-têtes.
 */

const text = z.string().max(2000);

export const mepSitePayloadSchema = z.object({
  formType: z.string().max(40),
  step: z.number().int().nonnegative(),
  totalSteps: z.number().int().nonnegative(),
  sessionId: z.string().min(1).max(120),
  fields: z.record(z.string(), text),
  score: z.number().optional(),
  page: text.optional(),
  utm: z
    .object({
      utm_source: text.optional(),
      utm_medium: text.optional(),
      utm_campaign: text.optional(),
      utm_content: text.optional(),
      utm_term: text.optional(),
    })
    .partial()
    .optional(),
  attribution: z
    .object({
      fbclid: text.optional(),
      fbc: text.optional(),
      fbp: text.optional(),
      landing_url: text.optional(),
      referrer: text.optional(),
    })
    .partial()
    .optional(),
  consent: z
    .object({
      text: text.optional(),
      version: text.optional(),
      at: text.optional(),
    })
    .partial()
    .optional(),
  answersVersion: text.optional(),
  sentAt: text.optional(),
});

export type MepSitePayload = z.infer<typeof mepSitePayloadSchema>;

/** Texte de consentement affiché sur le site, au mot près (LeadFormInline + diagnostic). */
export const MEP_CONSENT_TEXT_FALLBACK =
  'J’accepte que mes informations soient transmises à un ou plusieurs partenaires experts (conseillers en gestion de patrimoine, courtiers en assurance immatriculés ORIAS) afin d’être recontacté(e) dans le cadre de ma demande.';

export type MepAdapterResult =
  | { kind: 'lead'; payload: IngestPayload; complete: boolean }
  | { kind: 'ignore'; reason: 'no_consent' | 'no_phone' | 'no_first_name' };

const empty = (v: string | undefined): string | undefined => (v?.trim() ? v.trim() : undefined);

export function adaptMepSitePayload(
  input: MepSitePayload,
  server: { ip?: string | null; userAgent?: string | null; receivedAt: Date },
): MepAdapterResult {
  const { contact, answers } = splitContactFromFields(input.fields);
  if (contact.consentement !== 'oui') return { kind: 'ignore', reason: 'no_consent' };
  if (!empty(contact.telephone)) return { kind: 'ignore', reason: 'no_phone' };
  if (!empty(contact.prenom)) return { kind: 'ignore', reason: 'no_first_name' };

  const complete =
    contact.statut === 'complet' ||
    input.formType === 'rappel' ||
    (input.totalSteps > 0 && input.step >= input.totalSteps);

  const consentAtRaw = empty(input.consent?.at);
  const consentAt = consentAtRaw ? new Date(consentAtRaw) : server.receivedAt;

  const utm = input.utm ?? {};
  const attr = input.attribution ?? {};

  const payload: IngestPayload = {
    idempotency_key: `mep-site-${input.sessionId}`,
    source: 'mep',
    first_name: contact.prenom?.trim() ?? '',
    last_name: null,
    phone: contact.telephone?.trim() ?? '',
    email: empty(contact.email) ?? null,
    locale: 'fr-FR',
    answers: { ...answers, form_type: input.formType },
    answers_version: empty(input.answersVersion) ?? MEP_ANSWERS_VERSION,
    answers_complete: complete,
    site_score: typeof input.score === 'number' ? Math.round(input.score) : null,
    consent: {
      text: empty(input.consent?.text) ?? MEP_CONSENT_TEXT_FALLBACK,
      version: empty(input.consent?.version) ?? null,
      at: Number.isNaN(consentAt.getTime()) ? server.receivedAt : consentAt,
      ip: server.ip ?? null,
      user_agent: server.userAgent ?? null,
      partner_transfer: true,
    },
    attribution: {
      utm_source: empty(utm.utm_source) ?? null,
      utm_medium: empty(utm.utm_medium) ?? null,
      utm_campaign: empty(utm.utm_campaign) ?? null,
      utm_content: empty(utm.utm_content) ?? null,
      utm_term: empty(utm.utm_term) ?? null,
      fbclid: empty(attr.fbclid) ?? null,
      fbc: empty(attr.fbc) ?? null,
      fbp: empty(attr.fbp) ?? null,
      landing_url: empty(attr.landing_url) ?? null,
      referrer: empty(attr.referrer) ?? null,
      page: empty(input.page) ?? null,
    },
  };

  return { kind: 'lead', payload, complete };
}
