import { describe, expect, test } from 'vitest';
import { hasUsableAttribution, ingestPayloadSchema } from '@/lib/domain/ingest-schema';
import {
  adaptMepSitePayload,
  MEP_CONSENT_TEXT_FALLBACK,
  mepSitePayloadSchema,
} from '@/lib/domain/mep-site-adapter';

const receivedAt = new Date('2026-09-04T10:14:22Z');

const sitePayload = {
  formType: 'diagnostic',
  step: 3,
  totalSteps: 9,
  sessionId: 'mep-abc123-xyz',
  fields: {
    objectif: 'impots',
    montant: '10k-50k',
    prenom: 'Marc',
    telephone: '06 12 34 56 78',
    email: 'marc@example.com',
    consentement: 'oui',
  },
  score: 11,
  page: '/diagnostic/',
  utm: {
    utm_source: 'meta',
    utm_medium: 'paid',
    utm_campaign: 'MEP · Impôts · TMI30',
    utm_content: 'Salarié 40-55',
    utm_term: 'V2',
  },
  attribution: {
    fbclid: 'IwAR1',
    fbc: 'fb.1.1.IwAR1',
    fbp: 'fb.1.1.123',
    landing_url: 'https://monexpertpatrimoine.fr/?utm_source=meta',
    referrer: 'https://l.facebook.com/',
  },
  consent: { text: 'Texte exact affiché', version: '2026-08', at: '2026-09-04T10:14:20Z' },
  sentAt: '2026-09-04T10:14:21Z',
};

describe('adaptMepSitePayload', () => {
  test('transforme un envoi consenti en payload canonique valide', () => {
    const parsed = mepSitePayloadSchema.parse(sitePayload);
    const r = adaptMepSitePayload(parsed, { ip: '203.0.113.4', userAgent: 'UA', receivedAt });
    expect(r.kind).toBe('lead');
    if (r.kind !== 'lead') return;
    expect(r.complete).toBe(false);
    expect(r.payload.idempotency_key).toBe('mep-site-mep-abc123-xyz');
    expect(r.payload.first_name).toBe('Marc');
    expect(r.payload.phone).toBe('06 12 34 56 78');
    expect(r.payload.answers).toEqual({
      objectif: 'impots',
      montant: '10k-50k',
      form_type: 'diagnostic',
    });
    expect(r.payload.consent).toMatchObject({
      text: 'Texte exact affiché',
      version: '2026-08',
      ip: '203.0.113.4',
      user_agent: 'UA',
    });
    expect(r.payload.consent.at.toISOString()).toBe('2026-09-04T10:14:20.000Z');
    expect(r.payload.attribution).toMatchObject({
      utm_campaign: 'MEP · Impôts · TMI30',
      fbclid: 'IwAR1',
      fbp: 'fb.1.1.123',
      page: '/diagnostic/',
    });
    // Le canonique doit passer la validation Zod de l'endpoint principal.
    expect(ingestPayloadSchema.safeParse(r.payload).success).toBe(true);
    expect(hasUsableAttribution(r.payload.attribution)).toBe(true);
  });
  test('ignore un envoi sans consentement ou sans téléphone', () => {
    const parsed = mepSitePayloadSchema.parse({ ...sitePayload, fields: { objectif: 'impots' } });
    expect(adaptMepSitePayload(parsed, { receivedAt })).toEqual({
      kind: 'ignore',
      reason: 'no_consent',
    });
    const noPhone = mepSitePayloadSchema.parse({
      ...sitePayload,
      fields: { ...sitePayload.fields, telephone: '' },
    });
    expect(adaptMepSitePayload(noPhone, { receivedAt })).toEqual({
      kind: 'ignore',
      reason: 'no_phone',
    });
  });
  test('dernière étape ou variante courte : complet', () => {
    const last = mepSitePayloadSchema.parse({
      ...sitePayload,
      step: 9,
      fields: { ...sitePayload.fields, statut: 'complet' },
    });
    const r1 = adaptMepSitePayload(last, { receivedAt });
    expect(r1.kind === 'lead' && r1.complete).toBe(true);
    const rappel = mepSitePayloadSchema.parse({
      ...sitePayload,
      formType: 'rappel',
      step: 1,
      totalSteps: 1,
    });
    const r2 = adaptMepSitePayload(rappel, { receivedAt });
    expect(r2.kind === 'lead' && r2.complete).toBe(true);
  });
  test('sans texte de consentement transmis : le texte du site fait foi', () => {
    const parsed = mepSitePayloadSchema.parse({ ...sitePayload, consent: undefined });
    const r = adaptMepSitePayload(parsed, { receivedAt });
    expect(r.kind === 'lead' && r.payload.consent.text).toBe(MEP_CONSENT_TEXT_FALLBACK);
    expect(r.kind === 'lead' && r.payload.consent.at).toEqual(receivedAt);
  });
});

describe('hasUsableAttribution', () => {
  test('campagne, fbclid ou organique explicite', () => {
    expect(hasUsableAttribution({ utm_campaign: 'X' })).toBe(true);
    expect(hasUsableAttribution({ fbclid: 'Y' })).toBe(true);
    expect(hasUsableAttribution({ utm_source: 'organic' })).toBe(true);
    expect(hasUsableAttribution({ utm_source: 'meta' })).toBe(false);
    expect(hasUsableAttribution({})).toBe(false);
  });
});
