import { z } from 'zod';

/**
 * Payload canonique de réception d'un lead — section 4.1 de la spec.
 * Validé avec Zod à la frontière : tout ce qui n'y passe pas est un 422.
 */

const optionalText = z.string().trim().max(2000).optional().nullable();

export const attributionSchema = z
  .object({
    utm_source: optionalText,
    utm_medium: optionalText,
    utm_campaign: optionalText,
    utm_content: optionalText,
    utm_term: optionalText,
    fbclid: optionalText,
    fbc: optionalText,
    fbp: optionalText,
    landing_url: optionalText,
    referrer: optionalText,
    page: optionalText,
  })
  .default({});

export const consentSchema = z.object({
  text: z.string().trim().min(1, 'consent.text vide'),
  version: optionalText,
  at: z.coerce.date(),
  ip: optionalText,
  user_agent: optionalText,
  partner_transfer: z.boolean().optional(),
});

export const ingestPayloadSchema = z.object({
  idempotency_key: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1).max(50),
  first_name: z.string().trim().min(1).max(120),
  last_name: optionalText,
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(254).optional().nullable(),
  locale: optionalText,
  answers: z.record(z.string(), z.string().max(500)).default({}),
  answers_version: optionalText,
  answers_complete: z.boolean().optional(),
  site_score: z.number().int().optional().nullable(),
  consent: consentSchema,
  attribution: attributionSchema,
});

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;
export type Attribution = z.infer<typeof attributionSchema>;

export const answersPatchSchema = z.object({
  answers: z.record(z.string(), z.string().max(500)),
  answers_version: optionalText,
  answers_complete: z.boolean().optional(),
  site_score: z.number().int().optional().nullable(),
});

export type AnswersPatch = z.infer<typeof answersPatchSchema>;

/**
 * Un lead porte toujours son attribution : `utm_campaign` OU `fbclid`, sauf
 * trafic organique déclaré explicitement (`utm_source = organic`).
 */
export function hasUsableAttribution(a: Attribution): boolean {
  if (a.utm_campaign) return true;
  if (a.fbclid) return true;
  return (a.utm_source ?? '').toLowerCase() === 'organic';
}
