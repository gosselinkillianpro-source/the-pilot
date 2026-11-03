// @vitest-environment node
/**
 * Club deal contre un VRAI PostgreSQL (portage de club-deal.test.js + test HTTP de la route).
 *
 * Exécution : TEST_DATABASE_URL=postgres://… pnpm test:run tests/integration/club-deal.test.ts
 * Base de test JETABLE : la table club_deal_interests y est supprimée puis recréée
 * à partir de la vraie migration Drizzle. Sans TEST_DATABASE_URL, la suite est sautée.
 * Garde-fou : refuse toute URL Supabase et l'URL DATABASE_URL (production).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { normalizePhone } from '@/lib/club-deal/core';
import { clubDealHandlers } from '@/lib/club-deal/http';
import { queryableFrom } from '@/lib/club-deal/pg';
import { createClubDeal } from '@/lib/club-deal/service';

const URL_TEST = process.env.TEST_DATABASE_URL ?? '';
const unsafe =
  URL_TEST !== '' && (/supabase/i.test(URL_TEST) || URL_TEST === process.env.DATABASE_URL);
if (unsafe) throw new Error('TEST_DATABASE_URL pointe vers une base réelle : refusé.');

const MIGRATION = path.join(process.cwd(), 'drizzle/migrations/0029_club_deal_interests.sql');
const ORIGIN = 'https://www.sevenathome.com';

describe.skipIf(!URL_TEST)('club deal (PostgreSQL réel)', () => {
  const sql = postgres(URL_TEST, { prepare: false, max: 1, onnotice: () => {} });
  const db = queryableFrom(sql);
  let clock = Date.now();
  const cd = createClubDeal({
    db,
    allowedOrigins: [ORIGIN, 'https://sevenathome.com'],
    now: () => new Date(clock),
    log: () => {},
    defer: () => {},
  });

  const base = (o: Record<string, unknown> = {}) => ({
    prenom: 'Marie',
    nom: 'Durand',
    email: 'Marie@Example.com',
    telephone: '06 12 34 56 78',
    statut: 'investisseur',
    dossiers: ['jonage', 'npl'],
    montant: '10k-25k',
    disponibilite: '15j',
    message: 'Plutôt Jonage.',
    consent_interet: '1',
    consent_rgpd: '1',
    consent_tel: '1',
    ts: clock - 10_000,
    website: '',
    utm_source: 'brevo',
    utm_medium: 'email',
    utm_campaign: 'retour-aux-sources',
    page_url: 'https://www.sevenathome.com/club-deal/',
    ...o,
  });
  const post = (d: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    cd.handleSubmit({
      body: JSON.stringify(d),
      contentType: 'text/plain;charset=UTF-8',
      ip: '1.1.1.1',
      origin: ORIGIN,
      userAgent: 'test',
      ...extra,
    });
  const json = (out: { body: string }) => JSON.parse(out.body);
  const count = async () => (await sql`SELECT count(*)::int AS n FROM club_deal_interests`)[0]?.n;

  beforeAll(async () => {
    await sql`DROP TABLE IF EXISTS club_deal_interests`;
    for (const stmt of readFileSync(MIGRATION, 'utf8').split('--> statement-breakpoint')) {
      await sql.unsafe(stmt);
    }
  });
  afterAll(() => sql.end({ timeout: 5 }));

  test('validation : erreurs nommées, rien enregistré', async () => {
    const out = await post(
      base({ prenom: '', email: 'x', dossiers: ['inconnu'], montant: 'zz', consent_rgpd: '' }),
      { ip: '2.2.2.2' },
    );
    const b = json(out);
    expect(out.status).toBe(200);
    expect(b.ok).toBe(false);
    for (const k of ['prenom', 'email', 'dossiers', 'montant', 'consent_rgpd'])
      expect(b.errors[k]).toBeTruthy();
    expect(b.errors.nom).toBeUndefined();
    expect(await count()).toBe(0);
  });

  test('pot de miel et envoi trop rapide', async () => {
    expect(json(await post(base({ website: 'http://spam' }), { ip: '3.3.3.3' })).ok).toBe(true);
    const fast = json(await post(base({ ts: clock - 500 }), { ip: '3.3.3.3' }));
    expect(fast.ok).toBe(false);
    expect(fast.errors._form).toBeTruthy();
    expect(await count()).toBe(0);
  });

  test('enregistrement complet + CORS', async () => {
    const out = await post(base());
    const b = json(out);
    expect(b.ok).toBe(true);
    expect(b.ref).toMatch(/^CD-\d{4}-[A-Z2-9]{4}$/);
    expect(out.headers['Access-Control-Allow-Origin']).toBe(ORIGIN);
    const [r] = await sql`SELECT * FROM club_deal_interests WHERE ref = ${b.ref}`;
    expect(r?.email).toBe('marie@example.com');
    expect(r?.telephone).toBe('+33612345678');
    expect(r?.dossiers).toEqual(['jonage', 'npl']);
    expect(r?.consent_tel).toBe(true);
    expect(r?.processing_status).toBe('nouveau');
    expect(r?.duplicate_of).toBeNull();
    expect(r?.utm_campaign).toBe('retour-aux-sources');
  });

  test('doublon détecté sur le même e-mail', async () => {
    const [first] =
      await sql`SELECT ref FROM club_deal_interests WHERE email = 'marie@example.com' ORDER BY id LIMIT 1`;
    const b = json(await post(base(), { ip: '4.4.4.4' }));
    const [r] = await sql`SELECT duplicate_of FROM club_deal_interests WHERE ref = ${b.ref}`;
    expect(r?.duplicate_of).toBe(first?.ref);
  });

  test("origine étrangère : pas d'en-tête CORS", async () => {
    const out = await post(base({ email: 'autre@example.com' }), {
      origin: 'https://evil.example.com',
      ip: '5.5.5.5',
    });
    expect(out.headers['Access-Control-Allow-Origin']).toBeUndefined();
    const pre = cd.handleOptions({ origin: ORIGIN });
    expect(pre.status).toBe(204);
    expect(pre.headers['Access-Control-Allow-Origin']).toBe(ORIGIN);
  });

  test('limitation à 5 envois par IP sur 10 minutes', async () => {
    let ok = 0;
    for (let i = 0; i < 7; i++)
      if (json(await post(base({ email: `p${i}@example.com` }), { ip: '9.9.9.9' })).ok) ok++;
    expect(ok).toBe(5);
    clock += 11 * 60 * 1000;
    expect(
      json(await post(base({ email: 'later@example.com', ts: clock - 10_000 }), { ip: '9.9.9.9' }))
        .ok,
    ).toBe(true);
  });

  test('formulaire classique sans JavaScript (urlencoded) : page HTML', async () => {
    const form = new URLSearchParams({
      prenom: 'Paul',
      nom: 'Martin',
      email: 'paul@martin.fr',
      statut: 'nouveau',
      montant: 'nsp',
      disponibilite: 'plus',
      consent_interet: '1',
      consent_rgpd: '1',
      ts: String(clock - 9000),
      website: '',
    });
    form.append('dossiers[]', 'srl');
    form.append('dossiers[]', 'jonage');
    const out = await cd.handleSubmit({
      body: form.toString(),
      contentType: 'application/x-www-form-urlencoded',
      ip: '6.6.6.6',
      origin: null,
    });
    expect(out.headers['Content-Type']).toMatch(/text\/html/);
    expect(out.body).toMatch(/bien reçu/);
    const [r] = await sql`SELECT dossiers FROM club_deal_interests WHERE email = 'paul@martin.fr'`;
    expect(r?.dossiers).toEqual(['srl', 'jonage']);
  });

  test('corps invalide : réponse propre', async () => {
    const out = await cd.handleSubmit({
      body: '{pas du json',
      contentType: 'text/plain',
      ip: '7.7.7.7',
      origin: ORIGIN,
    });
    expect(json(out).ok).toBe(false);
  });

  test('suivi : statut et notes', async () => {
    const [{ id } = { id: '0' }] =
      await sql`SELECT id FROM club_deal_interests WHERE email = 'paul@martin.fr'`;
    const row = await cd.updateProcessing(id, {
      processing_status: 'contacte',
      notes: 'Rappelé le 4/11',
    });
    expect(row?.processing_status).toBe('contacte');
    expect(row?.notes).toBe('Rappelé le 4/11');
    await expect(cd.updateProcessing(id, { processing_status: 'nimporte' })).rejects.toThrow();
    expect(await cd.list({ status: 'contacte' })).toHaveLength(1);
    expect(await cd.list({ q: 'MARTIN' })).toHaveLength(1);
    expect(await cd.list({ q: 'paul martin' })).toHaveLength(1);
  });

  test('export CSV : BOM, séparateur ; libellés, formules neutralisées', async () => {
    await post(base({ email: 'formule@example.com', nom: '=HYPERLINK("x")', ts: clock - 10_000 }), {
      ip: '8.8.8.8',
    });
    const csv = await cd.exportCsv();
    expect(csv.startsWith('﻿Référence;Date;')).toBe(true);
    expect(csv).toMatch(/Jonage · Construction \(2 dossiers\) ; Espagne · NPL \(2 dossiers\)/);
    expect(csv).toMatch(/10 000 à 25 000 €/);
    expect(csv).toMatch(/"'=HYPERLINK\(""x""\)"/);
  });

  test('téléphone : normalisation', () => {
    expect(normalizePhone('06 12 34 56 78')).toBe('+33612345678');
    expect(normalizePhone('0032 470 12 34 56')).toBe('+32470123456');
    expect(normalizePhone('12')).toBeNull();
  });

  test('HTTP : OPTIONS puis POST text/plain depuis le site → CORS + ligne en base', async () => {
    const { OPTIONS, POST } = clubDealHandlers(cd);
    const url = 'http://localhost/api/club-deal';

    const pre = await OPTIONS(new Request(url, { method: 'OPTIONS', headers: { Origin: ORIGIN } }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST');

    const res = await POST(
      new Request(url, {
        method: 'POST',
        headers: {
          Origin: ORIGIN,
          'Content-Type': 'text/plain',
          'X-Forwarded-For': '203.0.113.7, 10.0.0.1',
        },
        body: JSON.stringify({
          prenom: 'Test',
          nom: 'Pilot',
          email: 'test@sevenathome.com',
          statut: 'nouveau',
          dossiers: ['srl'],
          montant: 'nsp',
          disponibilite: 'plus',
          consent_interet: '1',
          consent_rgpd: '1',
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const [r] = await sql`SELECT * FROM club_deal_interests WHERE ref = ${body.ref}`;
    expect(r?.email).toBe('test@sevenathome.com');
    expect(r?.dossiers).toEqual(['srl']);
    expect(r?.ip).toBe('203.0.113.7');
  });

  test('HTTP : corps trop gros refusé proprement, sans lecture', async () => {
    const { POST } = clubDealHandlers(cd);
    const res = await POST(
      new Request('http://localhost/api/club-deal', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'text/plain', 'Content-Length': '500000' },
        body: 'x',
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(false);
  });
});
