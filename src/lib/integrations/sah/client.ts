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

export type StatusLadderRow = {
  /** Valeur de status ajoutée à cet étage. */
  value: string;
  /** Profils (grain ligne) ayant exactement ce status. */
  profiles: number;
  /** Personnes ayant AU MOINS un profil avec ce status. */
  persons: number;
  /** Personnes couvertes cumulativement (bool_or sur l'ensemble jusqu'ici). */
  cumulativePersons: number;
};

export type ProfilCompletDiagnostic = {
  totalProfiles: number;
  totalPersons: number;
  /** Cibles tirées du fichier exporté le 2026-06-04 (pour repérer la bonne colonne). */
  targets: { profilesComplete: number; personsComplete: number; personsOnboarded: number };
  candidates: ProfilCompletCandidate[];
  /** Échelle des valeurs de status, avec couverture cumulée au grain personne. */
  statusLadder: StatusLadderRow[];
  /** Contrôles de cohérence (grain personne). */
  sanity: { validatePersons: number; onboardedPersons: number };
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

  // Échelle des valeurs de status (la plus probable pour "profil complet").
  const statusRows = await sql<{ status: string | null; profiles: number; persons: number }[]>`
    select status, count(*)::int as profiles, count(distinct user_id)::int as persons
    from users_profiles
    group by status
    order by persons desc
  `.catch(() => []);

  // Couverture cumulée au grain personne : bool_or sur l'ensemble grandissant des
  // valeurs de status (triées par fréquence). On cherche l'étage qui atteint 2111.
  const statusLadder: StatusLadderRow[] = [];
  const acc: (string | null)[] = [];
  for (const r of statusRows) {
    acc.push(r.status);
    const nonNull = acc.filter((v): v is string => v !== null);
    const includesNull = acc.some((v) => v === null);
    const cond = includesNull
      ? sql`(status = any(${nonNull}) or status is null)`
      : sql`status = any(${nonNull})`;
    const c = await sql<{ n: number }[]>`
      select count(distinct user_id)::int as n from users_profiles where ${cond}
    `.catch(() => [{ n: -1 }]);
    statusLadder.push({
      value: r.status ?? '(vide)',
      profiles: r.profiles,
      persons: r.persons,
      cumulativePersons: c[0]?.n ?? -1,
    });
  }

  // Contrôles : notre mapping actuel (status='validate') et l'onboarding (déjà juste).
  const validate = await sql<{ n: number }[]>`
    select count(distinct user_id)::int as n from users_profiles where status = 'validate'
  `.catch(() => [{ n: -1 }]);
  const onboarded = await sql<{ n: number }[]>`
    select count(distinct user_id)::int as n
    from users_profiles
    where wallet_status = '6' or lw_onboarding_status = 'accepted'
  `.catch(() => [{ n: -1 }]);

  return {
    totalProfiles: totals[0]?.profiles ?? -1,
    totalPersons: totals[0]?.persons ?? -1,
    targets: { profilesComplete: 2168, personsComplete: 2111, personsOnboarded: 1795 },
    candidates,
    statusLadder,
    sanity: { validatePersons: validate[0]?.n ?? -1, onboardedPersons: onboarded[0]?.n ?? -1 },
  };
}

export type RegFieldDiagnostic = {
  totalPersons: number;
  targetPersons: number; // cible "profil complet" du fichier (grain personne)
  candidates: { label: string; persons: number }[];
};

/**
 * Cherche la définition de "profil complété" = champs perso renseignés (table users).
 * Teste des ensembles cumulatifs de champs et compte les personnes qui les ont tous.
 * La bonne définition est celle qui reproduit la cible (2111 personnes). NON-SENSIBLE.
 */
export async function getRegFieldDiagnostic(): Promise<RegFieldDiagnostic> {
  const sql = getSahClient();
  // nz(col) = champ varchar non vide ; les dates → is not null.
  const r = await sql<
    {
      total: number;
      c1: number;
      c2: number;
      c3: number;
      c4: number;
      c5: number;
      c6: number;
      c7: number;
    }[]
  >`
    with u as (
      select
        (nullif(first_name, '') is not null and nullif(last_name, '') is not null) as has_name,
        (birthdate is not null) as has_bd,
        (nullif(phone_number, '') is not null) as has_phone,
        (nullif(nationality, '') is not null) as has_nat,
        (nullif(street_address_and_number, '') is not null and nullif(city, '') is not null
          and nullif(zip_code, '') is not null and nullif(country, '') is not null) as has_addr,
        (nullif(tax_residency_country, '') is not null) as has_fisc,
        (nullif(native_country, '') is not null and nullif(native_city, '') is not null
          and nullif(native_zip_code, '') is not null) as has_birthplace
      from users
      where email is not null
    )
    select
      count(*)::int as total,
      count(*) filter (where has_name)::int as c1,
      count(*) filter (where has_name and has_bd)::int as c2,
      count(*) filter (where has_name and has_bd and has_phone)::int as c3,
      count(*) filter (where has_name and has_bd and has_phone and has_nat)::int as c4,
      count(*) filter (where has_name and has_bd and has_phone and has_nat and has_addr)::int as c5,
      count(*) filter (where has_name and has_bd and has_phone and has_nat and has_addr and has_fisc)::int as c6,
      count(*) filter (where has_name and has_bd and has_phone and has_nat and has_addr and has_fisc and has_birthplace)::int as c7
    from u
  `.catch(() => [{ total: -1, c1: -1, c2: -1, c3: -1, c4: -1, c5: -1, c6: -1, c7: -1 }]);
  const row = r[0] ?? { total: -1, c1: -1, c2: -1, c3: -1, c4: -1, c5: -1, c6: -1, c7: -1 };
  return {
    totalPersons: row.total,
    targetPersons: 2111,
    candidates: [
      { label: 'nom + prénom', persons: row.c1 },
      { label: '+ date de naissance', persons: row.c2 },
      { label: '+ téléphone', persons: row.c3 },
      { label: '+ nationalité', persons: row.c4 },
      { label: '+ adresse (rue/ville/CP/pays)', persons: row.c5 },
      { label: '+ résidence fiscale', persons: row.c6 },
      { label: '+ lieu de naissance', persons: row.c7 },
    ],
  };
}

export type SahSubCount = { count: number; total: number };

export type SahBreachSubDiag = {
  nonCancelled: SahSubCount; // canceled_at null (annulé exclu)
  nonCancelledNonFailed: SahSubCount; // + payment_failed_at null
  reserved: SahSubCount; // réservé (reservation = true), non annulé
  validatedNonReserved: SahSubCount; // validé (reservation = false), non annulé, non échoué
  failed: SahSubCount; // paiement échoué (non annulé)
  cancelled: SahSubCount; // annulé
};

/**
 * Diagnostic des souscriptions des leads BREACH (code bonus contenant "breach").
 * Teste plusieurs définitions de "collecte" pour retrouver la cible 156 / 63 788 €.
 * Règle visée : garder validé OU réservé, exclure annulé. NON-SENSIBLE (agrégats).
 */
export async function getSahBreachSubDiag(): Promise<SahBreachSubDiag> {
  const sql = getSahClient();

  const one = async (cond: ReturnType<typeof sql>): Promise<SahSubCount> => {
    const r = await sql<{ count: number; total: number }[]>`
      select count(*)::int as count, coalesce(sum(s.amount), 0)::bigint as total
      from subscriptions s
      join users_profiles up on up.id = s.users_profile_id
      join users u on u.id = up.user_id
      join bonus_codes bc on bc.id = u.bonus_code_id
      where bc.code ilike '%breach%' and ${cond}
    `.catch(() => [{ count: -1, total: -1 }]);
    return { count: r[0]?.count ?? -1, total: Number(r[0]?.total ?? -1) };
  };

  const [nonCancelled, nonCancelledNonFailed, reserved, validatedNonReserved, failed, cancelled] =
    await Promise.all([
      one(sql`s.canceled_at is null`),
      one(sql`s.canceled_at is null and s.payment_failed_at is null`),
      one(sql`s.canceled_at is null and s.reservation = true`),
      one(sql`s.canceled_at is null and s.reservation = false and s.payment_failed_at is null`),
      one(sql`s.canceled_at is null and s.payment_failed_at is not null`),
      one(sql`s.canceled_at is not null`),
    ]);

  return { nonCancelled, nonCancelledNonFailed, reserved, validatedNonReserved, failed, cancelled };
}

/* ============================================================
   DIAGNOSTIC PARRAINAGE — l'arbre BREACH multi-niveaux est-il reconstructible ?
   On cherche, côté SAH, un lien "code de parrainage -> propriétaire (le parrain)".
   100% NON SENSIBLE : structure (information_schema) + comptes agrégés uniquement.
   ============================================================ */
export type SahReferralDiag = {
  bonusCodeColumns: { column: string; type: string }[];
  ownerCandidates: string[]; // colonnes de bonus_codes pouvant pointer vers le propriétaire
  referralTables: string[]; // tables liées au parrainage
  userReferralColumns: string[]; // colonnes de users liées au parrainage
  totalBonusCodes: number;
  breachBonusCodes: number;
  verdict: 'likely' | 'unlikely' | 'unknown';
};

// Une colonne "propriétaire" probable : référence un user/compte/parrain.
const OWNER_COL = /(^|_)(user|owner|account|ambassador|parent|sponsor|referr|parrain)(_id)?$/i;
const REFERRAL_NAME = /(bonus|referr|sponsor|parrain|affiliat|ambassad|godfather|invit)/i;

export async function getSahReferralDiag(): Promise<SahReferralDiag> {
  const sql = getSahClient();

  const bonusCodeColumns = await sql<{ column_name: string; data_type: string }[]>`
    select column_name, data_type
    from information_schema.columns
    where table_name = 'bonus_codes'
    order by ordinal_position
  `
    .then((rows) => rows.map((r) => ({ column: r.column_name, type: r.data_type })))
    .catch(() => [] as { column: string; type: string }[]);

  const referralTables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema not in ('pg_catalog', 'information_schema')
      and (
        table_name ilike '%bonus%' or table_name ilike '%referr%' or table_name ilike '%sponsor%'
        or table_name ilike '%parrain%' or table_name ilike '%affiliat%' or table_name ilike '%ambassad%'
        or table_name ilike '%godfather%' or table_name ilike '%invit%'
      )
    order by table_name
  `
    .then((rows) => rows.map((r) => r.table_name))
    .catch(() => [] as string[]);

  const userReferralColumns = await sql<{ column_name: string }[]>`
    select column_name from information_schema.columns
    where table_name = 'users'
      and (
        column_name ilike '%bonus%' or column_name ilike '%referr%' or column_name ilike '%sponsor%'
        or column_name ilike '%parent%' or column_name ilike '%invit%' or column_name ilike '%parrain%'
        or column_name ilike '%ambassad%'
      )
    order by column_name
  `
    .then((rows) => rows.map((r) => r.column_name))
    .catch(() => [] as string[]);

  const totalBonusCodes = await sql<{ c: number }[]>`select count(*)::int as c from bonus_codes`
    .then((r) => r[0]?.c ?? -1)
    .catch(() => -1);
  const breachBonusCodes = await sql<{ c: number }[]>`
    select count(*)::int as c from bonus_codes where code ilike '%breach%'
  `
    .then((r) => r[0]?.c ?? -1)
    .catch(() => -1);

  const ownerCandidates = bonusCodeColumns.map((c) => c.column).filter((c) => OWNER_COL.test(c));

  const verdict: SahReferralDiag['verdict'] =
    bonusCodeColumns.length === 0
      ? 'unknown'
      : ownerCandidates.length > 0 || referralTables.length > 1
        ? 'likely'
        : 'unlikely';

  return {
    bonusCodeColumns,
    ownerCandidates,
    referralTables: referralTables.filter((t) => REFERRAL_NAME.test(t)),
    userReferralColumns,
    totalBonusCodes,
    breachBonusCodes,
    verdict,
  };
}

/* ============================================================
   DIAGNOSTIC ARBRE BREACH — parcourt réellement la généalogie (users.parent_id)
   à partir des inscrits BREACH directs, et compte par niveau + collecte.
   100% NON SENSIBLE (agrégats). Lecture seule (CTE récursive bornée).
   ============================================================ */
export type SahBreachTreeDiag = {
  directBreach: number; // niveau 0 (inscrits avec un code breach)
  byDepthParent: { depth: number; users: number; collecte: number }[];
  totalNetworkParent: number; // tous niveaux confondus (via parent_id)
  totalCollecteParent: number;
  usersWithParentId: number;
  usersWithInvitedBy: number;
  invitedByTypes: { value: string; count: number }[];
};

export async function getSahBreachTreeDiag(): Promise<SahBreachTreeDiag> {
  const sql = getSahClient();

  const directBreach = await sql<{ c: number }[]>`
    select count(*)::int as c
    from users u join bonus_codes bc on bc.id = u.bonus_code_id
    where bc.code ilike '%breach%'
  `
    .then((r) => r[0]?.c ?? -1)
    .catch(() => -1);

  // Réseau via invited_by_id (type 'User') : le VRAI lien de parrainage SAH
  // (parent_id n'est quasi pas renseigné). Descendants des BREACH directs, par niveau.
  const byDepthParent = await sql<{ depth: number; users: number; collecte: number }[]>`
    with recursive direct as (
      select u.id
      from users u join bonus_codes bc on bc.id = u.bonus_code_id
      where bc.code ilike '%breach%'
    ),
    tree as (
      select id, 0 as depth from direct
      union all
      select c.id, t.depth + 1
      from users c
      join tree t on c.invited_by_id = t.id and c.invited_by_type = 'User'
      where t.depth < 12
    )
    select t.depth::int as depth,
           count(distinct t.id)::int as users,
           coalesce(sum(case when s.canceled_at is null then s.amount else 0 end), 0)::bigint as collecte
    from tree t
    left join users_profiles up on up.user_id = t.id
    left join subscriptions s on s.users_profile_id = up.id
    group by t.depth
    order by t.depth
  `
    .then((rows) =>
      rows.map((r) => ({
        depth: Number(r.depth),
        users: Number(r.users),
        collecte: Number(r.collecte),
      })),
    )
    .catch(() => [] as { depth: number; users: number; collecte: number }[]);

  const usersWithParentId = await sql<{ c: number }[]>`
    select count(*)::int as c from users where parent_id is not null
  `
    .then((r) => r[0]?.c ?? -1)
    .catch(() => -1);
  const usersWithInvitedBy = await sql<{ c: number }[]>`
    select count(*)::int as c from users where invited_by_id is not null
  `
    .then((r) => r[0]?.c ?? -1)
    .catch(() => -1);
  const invitedByTypes = await sql<{ value: string; count: number }[]>`
    select coalesce(invited_by_type, '(null)') as value, count(*)::int as count
    from users group by invited_by_type order by count desc limit 10
  `
    .then((rows) => rows.map((r) => ({ value: r.value, count: Number(r.count) })))
    .catch(() => [] as { value: string; count: number }[]);

  const totalNetworkParent = byDepthParent.reduce((s, d) => s + d.users, 0);
  const totalCollecteParent = byDepthParent.reduce((s, d) => s + d.collecte, 0);

  return {
    directBreach,
    byDepthParent,
    totalNetworkParent,
    totalCollecteParent,
    usersWithParentId,
    usersWithInvitedBy,
    invitedByTypes,
  };
}

/* ============================================================
   DIAGNOSTIC PROFOND — par quel chemin le SOUS-parrainage est-il traçable ?
   (invited_by email vs code bonus / affiliate_programs). Lecture seule, agrégats.
   ============================================================ */
export type SahReferralDeepDiag = {
  invitedByResolvable: number; // invited_by_type='User' dont l'id existe vraiment dans users
  n1DirectViaInvited: number; // personnes invitées DIRECTEMENT par un inscrit BREACH (email)
  affiliateProgramsColumns: string[];
  affiliateProgramsRows: number;
  exportsColumns: string[];
  breachCodes: {
    code: string;
    ambassadorName: string | null;
    distributorId: string | null;
    usersCount: number | null;
  }[];
};

async function colsOf(sql: ReturnType<typeof getSahClient>, table: string): Promise<string[]> {
  return sql<{ column_name: string }[]>`
    select column_name from information_schema.columns
    where table_name = ${table} order by ordinal_position
  `
    .then((rows) => rows.map((r) => r.column_name))
    .catch(() => [] as string[]);
}

export async function getSahReferralDeepDiag(): Promise<SahReferralDeepDiag> {
  const sql = getSahClient();

  const invitedByResolvable = await sql<{ c: number }[]>`
    select count(*)::int as c from users u
    where u.invited_by_type = 'User' and exists (select 1 from users x where x.id = u.invited_by_id)
  `
    .then((r) => r[0]?.c ?? -1)
    .catch(() => -1);

  const n1DirectViaInvited = await sql<{ c: number }[]>`
    with direct as (
      select u.id from users u join bonus_codes bc on bc.id = u.bonus_code_id
      where bc.code ilike '%breach%'
    )
    select count(*)::int as c
    from users c join direct d on c.invited_by_id = d.id and c.invited_by_type = 'User'
  `
    .then((r) => r[0]?.c ?? -1)
    .catch(() => -1);

  const affiliateProgramsColumns = await colsOf(sql, 'affiliate_programs');
  const affiliateProgramsRows = await sql<
    { c: number }[]
  >`select count(*)::int as c from affiliate_programs`
    .then((r) => r[0]?.c ?? -1)
    .catch(() => -1);
  const exportsColumns = await colsOf(sql, 'distributors_affiliated_profiles_exports');

  const breachCodes = await sql<
    {
      code: string;
      ambassador_name: string | null;
      distributor_id: string | null;
      users_count: number | null;
    }[]
  >`
    select code, ambassador_name, distributor_id::text as distributor_id, users_count
    from bonus_codes where code ilike '%breach%' order by users_count desc nulls last
  `
    .then((rows) =>
      rows.map((r) => ({
        code: r.code,
        ambassadorName: r.ambassador_name,
        distributorId: r.distributor_id,
        usersCount: r.users_count == null ? null : Number(r.users_count),
      })),
    )
    .catch(() => [] as SahReferralDeepDiag['breachCodes']);

  return {
    invitedByResolvable,
    n1DirectViaInvited,
    affiliateProgramsColumns,
    affiliateProgramsRows,
    exportsColumns,
    breachCodes,
  };
}

/* ============================================================
   DIAGNOSTIC ARBRE D'AFFILIATION (par CODE) — remonte le réseau d'UN admin
   à partir de SON code d'affiliation, via la chaîne des codes bonus
   (et non via invited_by_id, qui est quasi vide chez SAH).

   Auto-découvrant : dump les lignes complètes de bonus_codes + les tables
   "admin/affilié" pour identifier le lien "code -> propriétaire", puis tente
   l'arbre multi-niveaux pour chaque colonne propriétaire candidate.

   100% LECTURE SEULE. Pas de KYC (jamais de RIB/IBAN/pièce d'identité).
   Le réseau remonté est celui de l'admin lui-même (sa propre donnée).
   ============================================================ */
export type AffiliateTreeLevel = { depth: number; users: number; collecte: number };
export type AffiliateOwnerColResult = {
  column: string;
  byDepth: AffiliateTreeLevel[];
  total: number; // personnes hors racine (niveaux >= 1)
  error: string | null;
};
export type SahAffiliateTreeDiag = {
  rootEmail: string;
  rootCode: string;
  parentCode: string | null;
  rootUser: {
    id: string;
    bonusCodeId: string | null;
    invitedById: string | null;
    invitedByType: string | null;
    distributorId: string | null;
  } | null;
  codeRows: { code: string; row: Record<string, unknown> }[];
  bonusCodeColumns: string[];
  ownerColumnsMatchingRoot: string[]; // colonnes de bonus_codes dont la valeur == id racine
  ownerCandidateColumns: string[]; // colonnes "propriétaire" probables (regex)
  level1ViaCode: {
    count: number;
    sample: { name: string; email: string; createdAt: string | null }[];
  };
  adminTables: { table: string; columns: string[] }[];
  treeAttempts: AffiliateOwnerColResult[];
};

export async function getSahAffiliateTreeDiag(opts?: {
  rootEmail?: string;
  rootCode?: string;
  parentCode?: string;
}): Promise<SahAffiliateTreeDiag> {
  const sql = getSahClient();
  const rootEmail = opts?.rootEmail ?? 'gosselinkillian.pro@gmail.com';
  const rootCode = opts?.rootCode ?? 'Seven-club-deal-KG';
  const parentCode = opts?.parentCode ?? 'Seven-club-deal';

  // A) Utilisateur racine (l'admin) — champs non sensibles uniquement.
  const rootUser = await sql<
    {
      id: string;
      bonus_code_id: string | null;
      invited_by_id: string | null;
      invited_by_type: string | null;
      distributor_id: string | null;
    }[]
  >`
    select u.id::text as id, u.bonus_code_id::text as bonus_code_id,
           u.invited_by_id::text as invited_by_id, u.invited_by_type as invited_by_type,
           u.distributor_id::text as distributor_id
    from users u where lower(u.email) = lower(${rootEmail}) limit 1
  `
    .then((r) =>
      r[0]
        ? {
            id: r[0].id,
            bonusCodeId: r[0].bonus_code_id,
            invitedById: r[0].invited_by_id,
            invitedByType: r[0].invited_by_type,
            distributorId: r[0].distributor_id,
          }
        : null,
    )
    .catch(() => null);

  // B) Lignes complètes de bonus_codes pour les 2 codes (révèle la colonne propriétaire).
  const codes = [rootCode, parentCode].filter((c): c is string => Boolean(c));
  const codeRows = await sql<{ code: string; data: Record<string, unknown> }[]>`
    select bc.code as code, to_jsonb(bc) as data from bonus_codes bc where bc.code in ${sql(codes)}
  `
    .then((r) => r.map((x) => ({ code: x.code, row: x.data })))
    .catch(() => [] as { code: string; row: Record<string, unknown> }[]);

  const bonusCodeColumns = await colsOf(sql, 'bonus_codes');

  // Colonnes de bonus_codes (sur la ligne du code racine) dont la valeur == id de la racine.
  const kgRow = codeRows.find((c) => c.code === rootCode)?.row ?? null;
  const ownerColumnsMatchingRoot =
    kgRow && rootUser
      ? Object.keys(kgRow).filter((k) => kgRow[k] != null && String(kgRow[k]) === rootUser.id)
      : [];
  const ownerCandidateColumns = bonusCodeColumns.filter((c) => OWNER_COL.test(c));

  // C) Niveau 1 via le code (les affiliés directs).
  const level1Count = await sql<{ c: number }[]>`
    select count(*)::int as c from users u
    join bonus_codes bc on bc.id = u.bonus_code_id where bc.code = ${rootCode}
  `
    .then((r) => r[0]?.c ?? -1)
    .catch(() => -1);
  const level1Sample = await sql<
    { name: string | null; email: string; created_at: string | null }[]
  >`
    select nullif(trim(concat(coalesce(u.first_name,''),' ',left(coalesce(u.last_name,''),1))),'') as name,
           u.email as email, u.created_at::text as created_at
    from users u join bonus_codes bc on bc.id = u.bonus_code_id
    where bc.code = ${rootCode} order by u.created_at desc nulls last limit 15
  `
    .then((r) =>
      r.map((x) => ({ name: x.name ?? '(sans nom)', email: x.email, createdAt: x.created_at })),
    )
    .catch(() => [] as { name: string; email: string; createdAt: string | null }[]);

  // D) Tables candidates "admin / affilié / cgp / distributeur".
  const adminTableNames = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema not in ('pg_catalog','information_schema')
      and (table_name ilike '%admin%' or table_name ilike '%collab%'
        or table_name ilike '%affili%' or table_name ilike '%cgp%'
        or table_name ilike '%ambassad%' or table_name ilike '%distributor%')
    order by table_name
  `
    .then((r) => r.map((x) => x.table_name))
    .catch(() => [] as string[]);
  const adminTables: { table: string; columns: string[] }[] = [];
  for (const t of adminTableNames.slice(0, 25)) {
    adminTables.push({ table: t, columns: await colsOf(sql, t) });
  }

  // E) Arbre multi-niveaux via la chaîne des codes — un essai par colonne propriétaire candidate.
  // Lien : enfant.bonus_code_id -> code ; code.<colonne propriétaire> = ancêtre.id.
  const candidateCols = Array.from(
    new Set([...ownerColumnsMatchingRoot, ...ownerCandidateColumns]),
  ).slice(0, 6);
  const treeAttempts: AffiliateOwnerColResult[] = [];
  if (rootUser) {
    for (const col of candidateCols) {
      if (!bonusCodeColumns.includes(col)) continue; // garde-fou : colonne réelle
      const res = await sql<{ depth: number; users: number; collecte: number }[]>`
        with recursive tree as (
          select u.id as id, 0 as depth from users u where u.id::text = ${rootUser.id}
          union all
          select c.id, t.depth + 1
          from users c
          join bonus_codes bc on bc.id = c.bonus_code_id
          join tree t on bc.${sql(col)} = t.id
          where t.depth < 12
        )
        select t.depth::int as depth, count(distinct t.id)::int as users,
               coalesce(sum(case when s.canceled_at is null then s.amount else 0 end),0)::bigint as collecte
        from tree t
        left join users_profiles up on up.user_id = t.id
        left join subscriptions s on s.users_profile_id = up.id
        group by t.depth order by t.depth
      `
        .then((rows) => ({
          byDepth: rows.map((r) => ({
            depth: Number(r.depth),
            users: Number(r.users),
            collecte: Number(r.collecte),
          })),
          error: null as string | null,
        }))
        .catch((e: unknown) => ({
          byDepth: [] as AffiliateTreeLevel[],
          error: e instanceof Error ? e.message : 'erreur requête',
        }));
      const total = res.byDepth.filter((d) => d.depth >= 1).reduce((s, d) => s + d.users, 0);
      treeAttempts.push({ column: col, byDepth: res.byDepth, total, error: res.error });
    }
  }

  return {
    rootEmail,
    rootCode,
    parentCode,
    rootUser,
    codeRows,
    bonusCodeColumns,
    ownerColumnsMatchingRoot,
    ownerCandidateColumns,
    level1ViaCode: { count: level1Count, sample: level1Sample },
    adminTables,
    treeAttempts,
  };
}
