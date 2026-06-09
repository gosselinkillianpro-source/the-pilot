import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ANTHROPIC_MODELS, anthropic } from './anthropic';

/**
 * « Le Pilote » — assistant IA en langage naturel sur les données THE PILOT.
 *
 * Sécurité (règle CLAUDE.md #13 : aucun chiffre inventé) :
 *  - l'IA NE répond qu'après avoir exécuté une requête (function calling `run_sql`) ;
 *  - la requête est validée (UN seul SELECT, mots-clés d'écriture interdits) ;
 *  - exécutée dans une transaction READ ONLY + statement_timeout (aucune écriture
 *    possible même si la validation laissait passer quelque chose) + cap de lignes.
 *  Réservé à l'admin (cf. askPiloteAction). Données KYC sensibles à éviter (agrégats).
 */

const SCHEMA_DOC = `
Base PostgreSQL (lecture seule). Montants en EUROS. Utilise now() / current_date pour les dates relatives.
Toujours exclure les lignes supprimées : investors.deleted_at IS NULL. Pour les totaux de collecte,
exclure subscriptions.status = 'cancelled'. Privilégie les AGRÉGATS (count, sum, avg) ; n'expose jamais
de données personnelles brutes (phone, date_of_birth, address_street) — uniquement des agrégats/comptes.

TABLES :
- investors(id uuid, email, full_name, address_city, nationality, country_residence,
    registration_complete bool  -- TRUE = "profil complété" (infos perso renseignées)
    , onboarding_complete bool   -- TRUE = "onboardé" (KYC validé, peut investir)
    , pipeline_stage  -- enum: new, contacted, meeting_booked, meeting_done, proposal_sent, closed_won, closed_lost, dormant
    , total_invested numeric(€), projects_count int
    , first_subscription_at, last_subscription_at timestamptz
    , bonus_code text  -- contient 'breach' (insensible casse) => lead venant des pubs de Killian (BREACH)
    , cgp_name text, assigned_closer_id uuid -> users.id
    , sah_created_at timestamptz  -- date d'INSCRIPTION (création du compte côté SAH)
    , deleted_at timestamptz)
  Statuts dérivés : "inscrit" = NOT registration_complete AND NOT onboarding_complete ;
    "profil complété" = registration_complete = true ; "onboardé" = onboarding_complete = true.
- subscriptions(id, investor_id -> investors.id, project_id -> projects.id, amount numeric(€),
    status  -- enum: signed, paid, active, repaid, cancelled
    , signed_at, paid_at, canceled_at timestamptz, shares_count int)
- projects(id, name, status, target_amount, collected_amount, target_yield_annual numeric(%),
    duration_months int, location_city, repayment_date, opened_at)
- interactions(id, investor_id -> investors.id, type  -- ex: call_outbound, call_inbound, email_sent, email_opened, email_clicked, note_added
    , outcome  -- pour les appels: reached, no_answer, voicemail, wrong_number, callback_scheduled
    , user_id -> users.id (qui a fait l'action), created_at)
- closer_tasks(id, investor_id, closer_id -> users.id, type  -- callback, email, message, todo
    , status  -- pending, done, cancelled
    , due_at, created_at)
- users(id, full_name, role  -- admin, closer, closer_junior, executive
    , last_seen_at)
`.trim();

const SYSTEM = `Tu es "le Pilote", l'assistant data interne de THE PILOT (plateforme de pilotage de Seven At Home, investissement immobilier).
Tu réponds en FRANÇAIS, de façon concise et factuelle.

RÈGLE ABSOLUE : tu ne donnes JAMAIS un chiffre de mémoire. Pour toute donnée chiffrée, tu DOIS d'abord
appeler l'outil run_sql avec une requête SELECT, puis répondre uniquement à partir des lignes renvoyées.
Si la question ne peut pas être répondue avec les données disponibles, dis-le clairement
("je n'ai pas cette information"). N'invente jamais de colonne ni de valeur.

${SCHEMA_DOC}

Conseils : préfère une seule requête agrégée bien construite. Vérifie les définitions de statut ci-dessus.
Termine par une phrase de réponse claire (avec le chiffre), et si utile une courte précision.`;

const RUN_SQL_TOOL: Anthropic.Tool = {
  name: 'run_sql',
  description:
    'Exécute UNE requête PostgreSQL en LECTURE SEULE (SELECT/WITH uniquement) et renvoie les lignes (JSON). Utilise des agrégats.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Une seule requête SELECT PostgreSQL (sans point-virgule).',
      },
    },
    required: ['query'],
  },
};

/** Valide qu'il s'agit bien d'UNE requête lecture seule. Lève une erreur sinon. */
export function validateReadOnlySql(raw: string): string {
  const q = raw.trim().replace(/;+\s*$/, '');
  if (!q) throw new Error('Requête vide.');
  if (q.includes(';')) throw new Error('Une seule requête autorisée (pas de point-virgule).');
  if (!/^(select|with)\b/i.test(q)) throw new Error('Seules les requêtes SELECT sont autorisées.');
  const forbidden =
    /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|comment|copy|vacuum|analyze|merge|call|do|set|reset|lock|listen|notify|reindex|cluster|refresh|begin|commit|rollback|savepoint|prepare|execute|deallocate|explain)\b/i;
  const m = q.match(forbidden);
  if (m) throw new Error(`Mot-clé interdit : ${m[1]}`);
  const danger =
    /\b(pg_read_file|pg_ls_dir|pg_sleep|lo_import|lo_export|dblink|pg_terminate_backend|pg_cancel_backend)\b/i;
  if (danger.test(q)) throw new Error('Fonction système interdite.');
  return q;
}

/** Exécute la requête en transaction READ ONLY + timeout + cap de lignes. */
async function runReadOnlyQuery(query: string): Promise<unknown[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw('set transaction read only'));
    await tx.execute(sql.raw("set local statement_timeout = '6s'"));
    const res = await tx.execute(sql.raw(query));
    const rows = res as unknown as unknown[];
    return Array.isArray(rows) ? rows.slice(0, 200) : rows;
  });
}

export type PiloteResult =
  | {
      ok: true;
      answer: string;
      sql: string | null;
      model: string;
      promptTokens: number;
      completionTokens: number;
      latencyMs: number;
    }
  | { ok: false; reason: 'no_key' | 'error'; message: string };

export async function askPilote(question: string): Promise<PiloteResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      reason: 'no_key',
      message: 'Clé IA absente : ajoute ANTHROPIC_API_KEY puis relance le serveur.',
    };
  }

  const model = ANTHROPIC_MODELS.complex;
  const startedAt = Date.now();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }];
  let promptTokens = 0;
  let completionTokens = 0;
  let lastSql: string | null = null;

  try {
    for (let step = 0; step < 4; step++) {
      const resp = await anthropic.messages.create({
        model,
        max_tokens: 1500,
        system: SYSTEM,
        tools: [RUN_SQL_TOOL],
        messages,
      });
      promptTokens += resp.usage.input_tokens;
      completionTokens += resp.usage.output_tokens;

      if (resp.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: resp.content });
        const toolUse = resp.content.find(
          (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use',
        );
        if (!toolUse) break;
        const query = (toolUse.input as { query?: string }).query ?? '';
        let toolResult: string;
        try {
          const safe = validateReadOnlySql(query);
          lastSql = safe;
          const rows = await runReadOnlyQuery(safe);
          toolResult = JSON.stringify(rows).slice(0, 8000);
        } catch (e) {
          toolResult = `ERREUR: ${e instanceof Error ? e.message : 'requête refusée'}`;
        }
        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: toolResult }],
        });
        continue;
      }

      const answer = resp.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map((c) => c.text)
        .join('\n')
        .trim();
      return {
        ok: true,
        answer: answer || "Je n'ai pas de réponse à formuler.",
        sql: lastSql,
        model,
        promptTokens,
        completionTokens,
        latencyMs: Date.now() - startedAt,
      };
    }
    return {
      ok: true,
      answer: "Je n'ai pas réussi à aboutir (trop d'étapes). Reformule peut-être ta question.",
      sql: lastSql,
      model,
      promptTokens,
      completionTokens,
      latencyMs: Date.now() - startedAt,
    };
  } catch (e) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : 'Erreur IA.' };
  }
}
