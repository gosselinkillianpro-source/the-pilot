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
  onboardingStatuses: { value: string; count: number }[];
  walletStatuses: { value: string; count: number }[];
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

  const onboarding = await sql<{ s: string | null; n: number }[]>`
    select lw_onboarding_status as s, count(*)::int as n
    from users_profiles group by lw_onboarding_status order by n desc
  `.catch(() => []);

  const wallet = await sql<{ s: string | null; n: number }[]>`
    select wallet_status as s, count(*)::int as n
    from users_profiles group by wallet_status order by n desc
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
    onboardingStatuses: onboarding.map((r) => ({ value: r.s ?? '(vide)', count: r.n })),
    walletStatuses: wallet.map((r) => ({ value: r.s ?? '(vide)', count: r.n })),
  };
}

export type ProfilCompletCandidate = {
  column: string;
  type: 'boolean' | 'date';
  /** Nb de PROFILS (lignes users_profiles) où la condition est vraie. */
  trueProfiles: number;
  /** Nb de PERSONNES distinctes (user_id) où au moins un profil satisfait la condition. */
  truePersons: number;
};

export type ProfilCompletDiagnostic = {
  totalProfiles: number;
  totalPersons: number;
  /** Cibles tirées du fichier exporté le 2026-06-04 (pour repérer la bonne colonne). */
  targets: { profilesComplete: number; personsComplete: number; personsOnboarded: number };
  candidates: ProfilCompletCandidate[];
};

/**
 * Cherche la colonne SAH qui correspond à « Profil complet ? » du fichier exporté.
 * On scanne toutes les colonnes booléennes de users_profiles + les colonnes date
 * dont le nom évoque une complétion/validation, et on compte combien de profils /
 * personnes les satisfont. La bonne colonne est celle qui reproduit la cible.
 *
 * 100 % NON-SENSIBLE : uniquement des comptes agrégés, aucune donnée personnelle.
 */
export async function getProfilCompletDiagnostic(): Promise<ProfilCompletDiagnostic> {
  const sql = getSahClient();

  const totals = await sql<{ profiles: number; persons: number }[]>`
    select count(*)::int as profiles, count(distinct user_id)::int as persons
    from users_profiles
  `;

  // Colonnes booléennes + colonnes date "parlantes" (complétion / onboarding / validation / soumission).
  const cols = await sql<{ column_name: string; data_type: string }[]>`
    select column_name, data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = 'users_profiles'
      and (
        data_type = 'boolean'
        or (
          data_type in ('timestamp without time zone', 'timestamp with time zone', 'date')
          and (
            column_name ilike '%complet%' or column_name ilike '%onboard%'
            or column_name ilike '%validat%' or column_name ilike '%submit%'
            or column_name ilike '%finish%' or column_name ilike '%accept%'
          )
        )
      )
    order by data_type, column_name
  `;

  const candidates: ProfilCompletCandidate[] = [];
  for (const c of cols) {
    const isBool = c.data_type === 'boolean';
    // Condition de "vrai" : booléen = true ; date = NOT NULL (étape franchie).
    const cond = isBool
      ? sql`${sql(c.column_name)} is true`
      : sql`${sql(c.column_name)} is not null`;
    const r = await sql<{ tp: number; tpe: number }[]>`
      select count(*) filter (where ${cond})::int as tp,
             count(distinct user_id) filter (where ${cond})::int as tpe
      from users_profiles
    `.catch(() => [{ tp: -1, tpe: -1 }]);
    candidates.push({
      column: c.column_name,
      type: isBool ? 'boolean' : 'date',
      trueProfiles: r[0]?.tp ?? -1,
      truePersons: r[0]?.tpe ?? -1,
    });
  }

  // On remonte en tête les candidats les plus proches de la cible "profil complet".
  const TARGET_PROFILES = 2168;
  candidates.sort(
    (a, b) =>
      Math.abs(a.trueProfiles - TARGET_PROFILES) - Math.abs(b.trueProfiles - TARGET_PROFILES),
  );

  return {
    totalProfiles: totals[0]?.profiles ?? -1,
    totalPersons: totals[0]?.persons ?? -1,
    targets: { profilesComplete: 2168, personsComplete: 2111, personsOnboarded: 1795 },
    candidates,
  };
}
