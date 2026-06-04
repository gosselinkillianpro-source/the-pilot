import 'server-only';
import postgres from 'postgres';

/**
 * Client PostgreSQL vers la RÉPLIQUE LECTURE SEULE de Seven At Home.
 * Distinct de notre propre base (Supabase). Connexion chiffrée (SSL) obligatoire.
 *
 * ⚠️ La connexion ne fonctionne QUE depuis les IP whitelistées par SAH
 * (les IP dédiées Render). Depuis un autre réseau, SAH refuse la connexion.
 *
 * Usage strictement READ-ONLY : on ne fait jamais que des SELECT.
 */
const globalForSah = globalThis as unknown as { __sahClient?: ReturnType<typeof postgres> };

export function getSahClient(): ReturnType<typeof postgres> {
  const url = process.env.SAH_DATABASE_URL;
  if (!url) {
    throw new Error('SAH_DATABASE_URL non configurée (à régler dans les variables Render).');
  }
  if (!globalForSah.__sahClient) {
    globalForSah.__sahClient = postgres(url, {
      prepare: false,
      max: 3,
      idle_timeout: 20,
      connect_timeout: 15,
      ssl: 'require',
    });
  }
  return globalForSah.__sahClient;
}

export type SahColumn = { table: string; column: string; type: string; nullable: boolean };

/**
 * Récupère le schéma (tables + colonnes) de la réplique SAH.
 * N'expose AUCUNE donnée — uniquement la structure (information_schema).
 */
export async function getSahSchema(): Promise<SahColumn[]> {
  const sql = getSahClient();
  const rows = await sql<
    { table_name: string; column_name: string; data_type: string; is_nullable: string }[]
  >`
    select table_name, column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema not in ('pg_catalog', 'information_schema')
    order by table_name, ordinal_position
  `;
  return rows.map((r) => ({
    table: r.table_name,
    column: r.column_name,
    type: r.data_type,
    nullable: r.is_nullable === 'YES',
  }));
}

export type SahDiagnostics = {
  counts: { table: string; rows: number }[];
  profileStatuses: { value: string; count: number }[];
  kycValidatedCount: number;
  suitabilityStates: { value: string; count: number }[];
};

/**
 * Diagnostic NON-SENSIBLE : uniquement des comptes et des valeurs de statut
 * (énumérations), aucune donnée personnelle. Sert à caler les règles de mapping
 * (notamment "profil complet").
 */
export async function getSahDiagnostics(): Promise<SahDiagnostics> {
  const sql = getSahClient();

  const countOf = async (table: string): Promise<number> => {
    try {
      const r = await sql<{ n: number }[]>`select count(*)::int as n from ${sql(table)}`;
      return r[0]?.n ?? 0;
    } catch {
      return -1; // table absente / non lisible
    }
  };

  const [usersN, profilesN, projectsN, subsN, lendingN, intentionsN] = await Promise.all([
    countOf('users'),
    countOf('users_profiles'),
    countOf('projects'),
    countOf('subscriptions'),
    countOf('lending_investor_terms'),
    countOf('subscription_intentions'),
  ]);

  const profileStatuses = await sql<{ status: string | null; n: number }[]>`
    select status, count(*)::int as n from users_profiles group by status order by n desc
  `.catch(() => []);

  const kyc = await sql<{ n: number }[]>`
    select count(*)::int as n from users_profiles where kyc_validated_at is not null
  `.catch(() => [{ n: -1 }]);

  const suitability = await sql<{ state: string | null; n: number }[]>`
    select state, count(*)::int as n
    from capsens_suitability_questionnaire_questionnaires
    group by state order by n desc
  `.catch(() => []);

  return {
    counts: [
      { table: 'users (inscrits)', rows: usersN },
      { table: 'users_profiles', rows: profilesN },
      { table: 'projects', rows: projectsN },
      { table: 'subscriptions', rows: subsN },
      { table: 'lending_investor_terms (échéances)', rows: lendingN },
      { table: 'subscription_intentions', rows: intentionsN },
    ],
    profileStatuses: profileStatuses.map((r) => ({ value: r.status ?? '(vide)', count: r.n })),
    kycValidatedCount: kyc[0]?.n ?? -1,
    suitabilityStates: suitability.map((r) => ({ value: r.state ?? '(vide)', count: r.n })),
  };
}
