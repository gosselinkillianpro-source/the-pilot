/**
 * Club deal : cœur indépendant du framework. Prend des valeurs brutes et renvoie
 * { status, headers, body }. La base est un client exposant query(text, params)
 * → { rows } ; en prod c'est la base de THE PILOT, JAMAIS la base SAH.
 */
import { type BrevoConfig, type CopyConfig, type Logger, sendAfterInsert } from './brevo';
import {
  type ClubDealRow,
  DISPOS,
  DOSSIERS,
  isKeyOf,
  label,
  MONTANTS,
  PROCESSING,
  type ProcessingStatus,
  STATUTS,
} from './constants';
import {
  corsHeaders,
  csvCell,
  esc,
  type FieldErrors,
  newRefCandidate,
  normalizeOrigin,
  parseBody,
  str,
  validate,
} from './core';

export type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type HttpOut = { status: number; headers: Record<string, string>; body: string };

export type SubmitResult = { ok: true; ref: string } | { ok: false; errors: FieldErrors };

export type SubmitInput = {
  body: string;
  contentType?: string | null;
  ip?: string | null;
  origin?: string | null;
  userAgent?: string | null;
};

export type ListFilters = {
  status?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
};

export type ClubDealOptions = {
  db: Queryable;
  allowedOrigins: string[];
  brevo?: BrevoConfig;
  copy?: Partial<CopyConfig>;
  log?: Logger;
  now?: () => Date;
  /** Exécute une tâche après la réponse (Next : `after`). Par défaut : setImmediate. */
  defer?: (task: () => Promise<void>) => void;
};

const MIN_FILL_MS = 4000;
const RATE_MAX = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAP_MAX = 5000;
const DUP_DAYS = 30;
const REF_ATTEMPTS = 8;
const LIST_MAX = 1000;
const EXPORT_MAX = 10_000;
const HONEYPOT_REF = 'CD-0000-XXXX';

const ERR_RATE =
  'Trop de tentatives depuis votre connexion. Merci de réessayer dans quelques minutes.';
const ERR_FAST =
  "Le formulaire n'a pas pu être vérifié. Merci de recharger la page et de réessayer.";
const ERR_INSERT =
  "Impossible d'enregistrer votre demande pour le moment. Merci de réessayer dans quelques minutes.";

const asRow = (r: Record<string, unknown>): ClubDealRow => r as unknown as ClubDealRow;

function htmlPage(res: SubmitResult): string {
  const back = res.ok
    ? `<h1>Merci, c'est bien reçu.</h1><p>Votre référence : <strong>${esc(res.ref)}</strong>. Une confirmation vient de partir par e-mail.</p>`
    : `<h1>Il manque quelque chose.</h1><p>${Object.values(res.errors).map(esc).join('<br>')}</p><p>Revenez en arrière pour compléter le formulaire.</p>`;
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Seven At Home · Club deal</title><div style="font-family:Arial,sans-serif;max-width:560px;margin:60px auto;padding:0 20px;color:#1F1D1A;line-height:1.6">${back}</div></html>`;
}

export function createClubDeal(opts: ClubDealOptions) {
  const { db } = opts;
  const allowed = opts.allowedOrigins.map(normalizeOrigin);
  const brevo = opts.brevo ?? {};
  const copy: CopyConfig = {
    delayText: '72 heures ouvrées',
    places: 149,
    adminUrl: '',
    ...opts.copy,
  };
  const log: Logger = opts.log ?? ((e, c) => console.error('[club-deal]', c ?? '', e));
  const now = opts.now ?? (() => new Date());
  const defer =
    opts.defer ??
    ((task: () => Promise<void>) => {
      setImmediate(() => {
        task().catch((e: unknown) => log(e, 'afterInsert'));
      });
    });
  const hits = new Map<string, number[]>(); // ip → horodatages

  function rateLimited(ip: string): boolean {
    const t = now().getTime();
    const recent = (hits.get(ip) ?? []).filter((x) => t - x < RATE_WINDOW_MS);
    if (hits.size > RATE_MAP_MAX) hits.clear();
    if (recent.length >= RATE_MAX) {
      hits.set(ip, recent);
      return true;
    }
    hits.set(ip, [...recent, t]);
    return false;
  }

  function reply(res: SubmitResult, isForm: boolean, origin?: string | null): HttpOut {
    const headers = corsHeaders(origin, allowed);
    if (isForm) {
      return {
        status: 200,
        headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
        body: htmlPage(res),
      };
    }
    // Toujours 200 : le widget lit res.ok / res.errors, et un 4xx sans CORS masquerait le message.
    return {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(res),
    };
  }

  async function insertWithFreshRef(
    v: ReturnType<typeof validate>['v'],
    duplicateOf: string | null,
    ip: string | null,
    userAgent: string | null,
  ): Promise<ClubDealRow> {
    for (let i = 0; i < REF_ATTEMPTS; i++) {
      const r = await db.query(
        `INSERT INTO club_deal_interests
          (ref, prenom, nom, email, telephone, consent_tel, statut, dossiers, montant, disponibilite, message, duplicate_of,
           utm_source, utm_medium, utm_campaign, page_url, ip, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::text[],$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (ref) DO NOTHING
         RETURNING *`,
        [
          newRefCandidate(now()),
          v.prenom,
          v.nom,
          v.email,
          v.telephone || null,
          v.consent_tel,
          v.statut,
          v.dossiers,
          v.montant,
          v.disponibilite,
          v.message,
          duplicateOf,
          v.utm_source || null,
          v.utm_medium || null,
          v.utm_campaign || null,
          v.page_url || null,
          ip,
          userAgent,
        ],
      );
      if (r.rows[0]) return asRow(r.rows[0]);
    }
    throw new Error(`référence introuvable après ${REF_ATTEMPTS} essais`);
  }

  /** POST du formulaire. */
  async function handleSubmit(input: SubmitInput): Promise<HttpOut> {
    const { origin } = input;
    const { data, isForm } = parseBody(input.body);
    if (!data) return reply({ ok: false, errors: { _form: 'Requête invalide.' } }, false, origin);

    // Pot de miel : un robot remplit le champ caché, on fait comme si de rien n'était.
    if (str(data.website)) return reply({ ok: true, ref: HONEYPOT_REF }, isForm, origin);
    const ts = Number(data.ts) || 0;
    if (ts && now().getTime() - ts < MIN_FILL_MS) {
      return reply({ ok: false, errors: { _form: ERR_FAST } }, isForm, origin);
    }
    const { v, errors } = validate(data);
    if (Object.keys(errors).length) return reply({ ok: false, errors }, isForm, origin);
    if (rateLimited(input.ip || '0.0.0.0')) {
      return reply({ ok: false, errors: { _form: ERR_RATE } }, isForm, origin);
    }

    try {
      const dup = await db.query(
        `SELECT ref FROM club_deal_interests
         WHERE email = $1 AND created_at > now() - ($2 || ' days')::interval
         ORDER BY created_at DESC LIMIT 1`,
        [v.email, String(DUP_DAYS)],
      );
      const duplicateOf = (dup.rows[0]?.ref as string | undefined) ?? null;
      const row = await insertWithFreshRef(
        v,
        duplicateOf,
        input.ip || null,
        str(input.userAgent, 200) || null,
      );
      // Les e-mails partent après la réponse : l'investisseur n'attend pas Brevo.
      defer(() => sendAfterInsert(row, brevo, copy, log));
      return reply({ ok: true, ref: row.ref }, isForm, origin);
    } catch (e) {
      log(e, 'insert');
      return reply({ ok: false, errors: { _form: ERR_INSERT } }, isForm, origin);
    }
  }

  function handleOptions({ origin }: { origin?: string | null }): HttpOut {
    return { status: 204, headers: corsHeaders(origin, allowed), body: '' };
  }

  async function query(filters: ListFilters, cap: number): Promise<ClubDealRow[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.status && isKeyOf(PROCESSING, filters.status)) {
      params.push(filters.status);
      where.push(`processing_status = $${params.length}`);
    }
    const q = filters.q?.trim();
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      const p = `$${params.length}`;
      where.push(
        `(lower(email) LIKE ${p} OR lower(nom) LIKE ${p} OR lower(prenom) LIKE ${p} OR lower(prenom || ' ' || nom) LIKE ${p} OR lower(ref) LIKE ${p})`,
      );
    }
    params.push(Math.min(Number(filters.limit) || cap, cap), Number(filters.offset) || 0);
    const r = await db.query(
      `SELECT * FROM club_deal_interests ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return r.rows.map(asRow);
  }

  /** Liste pour l'écran d'administration (route protégée). */
  function list(filters: ListFilters = {}): Promise<ClubDealRow[]> {
    return query({ limit: 200, ...filters }, LIST_MAX);
  }

  /** Toutes les demandes (compteurs de l'écran), les plus récentes d'abord. */
  function listAll(): Promise<ClubDealRow[]> {
    return query({ limit: EXPORT_MAX }, EXPORT_MAX);
  }

  async function getById(id: number): Promise<ClubDealRow | null> {
    const r = await db.query('SELECT * FROM club_deal_interests WHERE id = $1', [id]);
    return r.rows[0] ? asRow(r.rows[0]) : null;
  }

  async function listByEmail(email: string): Promise<ClubDealRow[]> {
    const r = await db.query(
      'SELECT * FROM club_deal_interests WHERE email = $1 ORDER BY created_at DESC',
      [email.toLowerCase()],
    );
    return r.rows.map(asRow);
  }

  /** Mise à jour du suivi (route protégée). */
  async function updateProcessing(
    id: number | string,
    patch: { processing_status?: ProcessingStatus | string | null; notes?: string | null },
  ): Promise<ClubDealRow | null> {
    const status = patch.processing_status ?? null;
    if (status != null && !isKeyOf(PROCESSING, status)) throw new Error('statut inconnu');
    const r = await db.query(
      `UPDATE club_deal_interests
       SET processing_status = COALESCE($2, processing_status), notes = COALESCE($3, notes), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, status, patch.notes != null ? str(patch.notes, 4000) : null],
    );
    return r.rows[0] ? asRow(r.rows[0]) : null;
  }

  /** Export CSV « ; », UTF-8 avec BOM : s'ouvre dans Excel et s'importe dans Brevo (route protégée). */
  async function exportCsv(filters: ListFilters = {}): Promise<string> {
    const rows = await query({ ...filters, limit: EXPORT_MAX }, EXPORT_MAX);
    const head = [
      'Référence',
      'Date',
      'Prénom',
      'Nom',
      'E-mail',
      'Téléphone',
      'Accord appel',
      'Profil',
      'Dossiers',
      'Nb projets',
      'Montant',
      'Disponibilité',
      'Message',
      'Doublon de',
      'Traitement',
      'Notes',
      'UTM source',
      'UTM medium',
      'UTM campaign',
    ];
    const lines = [head.join(';')];
    for (const r of rows) {
      lines.push(
        [
          r.ref,
          r.created_at,
          r.prenom,
          r.nom,
          r.email,
          r.telephone,
          r.consent_tel ? 'Oui' : 'Non',
          label(STATUTS, r.statut),
          (r.dossiers ?? []).map((c) => label(DOSSIERS, c)),
          (r.dossiers ?? []).length,
          label(MONTANTS, r.montant),
          label(DISPOS, r.disponibilite),
          r.message,
          r.duplicate_of,
          label(PROCESSING, r.processing_status),
          r.notes,
          r.utm_source,
          r.utm_medium,
          r.utm_campaign,
        ]
          .map(csvCell)
          .join(';'),
      );
    }
    return `﻿${lines.join('\r\n')}`;
  }

  return {
    handleSubmit,
    handleOptions,
    list,
    listAll,
    getById,
    listByEmail,
    updateProcessing,
    exportCsv,
  };
}

export type ClubDeal = ReturnType<typeof createClubDeal>;
