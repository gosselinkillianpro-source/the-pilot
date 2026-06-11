import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { investors, projects, subscriptions } from '@/lib/db/schema';
import { getSahClient } from './client';

/**
 * Synchronisation SAH (réplique lecture seule) → notre Supabase.
 * On ne lit QUE les colonnes non sensibles (jamais IBAN, scans, mots de passe).
 * Upsert sur `sah_id` : on met à jour les champs venus de SAH, sans toucher aux
 * champs internes (score, pipeline, closer assigné…).
 */

export type SyncResult = {
  projects: number;
  investors: number;
  subscriptions: number;
  errors: string[];
};

const PROJECT_STATUS = new Set(['draft', 'open', 'funding', 'funded', 'in_operation', 'completed']);

/** Mappe un statut projet SAH (texte libre) vers notre enum, avec repli sûr. */
function mapProjectStatus(raw: string | null): string {
  const s = (raw ?? '').toLowerCase();
  if (PROJECT_STATUS.has(s)) return s;
  if (s.includes('draft') || s.includes('brouillon')) return 'draft';
  if (s.includes('fund') || s.includes('collect')) return 'funding';
  if (s.includes('operation') || s.includes('progress') || s.includes('cours'))
    return 'in_operation';
  if (s.includes('complet') || s.includes('finish') || s.includes('closed') || s.includes('repaid'))
    return 'completed';
  return 'open';
}

/** Extrait un nombre de mois depuis un texte de durée libre ("12 mois", "12"…). */
function parseDurationMonths(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/\d+/);
  return m ? Number.parseInt(m[0], 10) : null;
}

type SahProject = {
  id: string;
  name: string | null;
  status: string | null;
  maximum_targeted_amount: number | null;
  estimated_annual_profitability: string | null;
  investment_duration: string | null;
  collect_starts_at: Date | null;
  closing_date: Date | null;
  city: string | null;
  short_description: string | null;
  repayment_date: Date | null;
};

async function syncProjects(): Promise<number> {
  const sahDb = getSahClient();
  // repayment_date = DERNIÈRE échéance réelle calculée par SAH (lending_terms +
  // royalties_terms). C'est la vraie date de remboursement du capital, qui démarre
  // au financement effectif du projet (pas à l'ouverture). Sert aux relances avant échéance.
  const rows = await sahDb<SahProject[]>`
    select p.id::text, p.name, p.status, p.maximum_targeted_amount,
           p.estimated_annual_profitability::text, p.investment_duration,
           p.collect_starts_at, p.closing_date, p.city, p.short_description,
           (
             select max(due_on) from (
               select due_on from lending_terms where project_id = p.id
               union all
               select due_on from royalties_terms where project_id = p.id
             ) t
           )::timestamptz as repayment_date
    from projects p
  `;
  if (rows.length === 0) return 0;

  const values = rows.map((p) => ({
    sahId: p.id,
    name: p.name ?? `Projet ${p.id}`,
    status: mapProjectStatus(p.status) as 'open',
    targetAmount: p.maximum_targeted_amount != null ? String(p.maximum_targeted_amount) : null,
    targetYieldAnnual: p.estimated_annual_profitability ?? null,
    durationMonths: parseDurationMonths(p.investment_duration),
    openedAt: p.collect_starts_at ?? null,
    expectedCompletionAt: p.closing_date ?? null,
    repaymentDate: p.repayment_date ?? null,
    locationCity: p.city ?? null,
    descriptionShort: p.short_description ?? null,
    updatedAt: new Date(),
  }));

  await db
    .insert(projects)
    .values(values)
    .onConflictDoUpdate({
      target: projects.sahId,
      set: {
        name: sql`excluded.name`,
        status: sql`excluded.status`,
        targetAmount: sql`excluded.target_amount`,
        targetYieldAnnual: sql`excluded.target_yield_annual`,
        durationMonths: sql`excluded.duration_months`,
        openedAt: sql`excluded.opened_at`,
        expectedCompletionAt: sql`excluded.expected_completion_at`,
        repaymentDate: sql`excluded.repayment_date`,
        locationCity: sql`excluded.location_city`,
        descriptionShort: sql`excluded.description_short`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  return rows.length;
}

type SahInvestor = {
  id: string;
  email: string;
  civility: string | null;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  birthdate: string | null;
  nationality: string | null;
  country: string | null;
  street_address_and_number: string | null;
  additional_address: string | null;
  city: string | null;
  zip_code: string | null;
  tax_residency_country: string | null;
  wallet_balance_cents: number | null;
  bonus_code: string | null;
  cgp_name: string | null;
  cgp_network: string | null;
  parent_sah_id: string | null;
  parrain_name: string | null;
  sah_created_at: Date | null;
  sah_updated_at: Date | null;
  kyc_validated_at: Date | null;
  wallet_status: string | null;
  lw_onboarding_status: string | null;
  lw_onboarding_id: string | null;
  lemonway_account_id: string | null;
  profil_complet: boolean | null;
  onboarding_complet: boolean | null;
};

async function syncInvestors(): Promise<number> {
  const sahDb = getSahClient();
  // Un investisseur = une personne (users). Le statut profil/KYC vit sur users_profiles
  // (une personne peut avoir plusieurs profils) → on agrège au "plus avancé".
  // On ne lit JAMAIS encrypted_password, virtual_iban/bic (KYC bancaire interdit).
  // CGP : best effort (bonus_codes.ambassador_name + distributor_legal_entities.name).
  const rows = await sahDb<SahInvestor[]>`
    select
      u.id::text,
      u.email,
      u.civility,
      u.first_name,
      u.last_name,
      u.phone_number,
      u.birthdate::text,
      u.nationality,
      u.country,
      u.street_address_and_number,
      u.additional_address,
      u.city,
      u.zip_code,
      u.tax_residency_country,
      u.cached_wallet_balance_in_cents as wallet_balance_cents,
      bc.code as bonus_code,
      bc.ambassador_name as cgp_name,
      dle.name as cgp_network,
      -- Parrainage : le vrai lien SAH est invited_by_id (type 'User'), pas parent_id.
      case when u.invited_by_type = 'User' then u.invited_by_id::text end as parent_sah_id,
      nullif(trim(concat(coalesce(inv.first_name, ''), ' ', coalesce(inv.last_name, ''))), '') as parrain_name,
      u.created_at as sah_created_at,
      u.updated_at as sah_updated_at,
      max(p.kyc_validated_at) as kyc_validated_at,
      max(p.wallet_status) as wallet_status,
      max(p.lw_onboarding_status) as lw_onboarding_status,
      max(p.lw_onboarding_id) as lw_onboarding_id,
      max(p.account_id) as lemonway_account_id,
      -- Profil complété = la personne a rempli ses infos perso (formulaire SAH).
      -- Règle calée sur le fichier exporté (cible 2111, atteinte à ±5 par ce set).
      (
        nullif(u.first_name, '') is not null and nullif(u.last_name, '') is not null
        and u.birthdate is not null
        and nullif(u.phone_number, '') is not null
        and nullif(u.nationality, '') is not null
        and nullif(u.street_address_and_number, '') is not null
        and nullif(u.city, '') is not null
        and nullif(u.zip_code, '') is not null
        and nullif(u.country, '') is not null
      ) as profil_complet,
      bool_or(p.wallet_status = '6' or p.lw_onboarding_status = 'accepted') as onboarding_complet
    from users u
    left join users_profiles p on p.user_id = u.id
    left join bonus_codes bc on bc.id = u.bonus_code_id
    left join distributor_legal_entities dle on dle.id = u.distributor_id
    left join users inv on inv.id = u.invited_by_id and u.invited_by_type = 'User'
    where u.email is not null
    group by u.id, u.email, u.civility, u.first_name, u.last_name, u.phone_number,
             u.birthdate, u.nationality, u.country, u.street_address_and_number,
             u.additional_address, u.city, u.zip_code, u.tax_residency_country,
             u.cached_wallet_balance_in_cents, u.created_at, u.updated_at,
             bc.code, bc.ambassador_name, dle.name, inv.first_name, inv.last_name
  `;
  if (rows.length === 0) return 0;

  const values = rows.map((u) => {
    const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || null;
    return {
      sahId: u.id,
      email: u.email,
      civility: u.civility ?? null,
      firstName: u.first_name ?? null,
      lastName: u.last_name ?? null,
      fullName,
      phone: u.phone_number ?? null,
      dateOfBirth: u.birthdate ?? null,
      nationality: u.nationality ?? null,
      countryResidence: u.country ?? null,
      addressStreet: u.street_address_and_number ?? null,
      addressComplement: u.additional_address ?? null,
      addressCity: u.city ?? null,
      addressPostalCode: u.zip_code ?? null,
      taxResidencyCountry: u.tax_residency_country ?? null,
      bonusCode: u.bonus_code ?? null,
      cgpName: u.cgp_name ?? null,
      cgpNetwork: u.cgp_network ?? null,
      parentSahId: u.parent_sah_id ?? null,
      parrainName: u.parrain_name ?? null,
      walletBalanceCents: u.wallet_balance_cents ?? null,
      walletStatus: u.wallet_status ?? null,
      lwOnboardingStatus: u.lw_onboarding_status ?? null,
      lwOnboardingId: u.lw_onboarding_id ?? null,
      lemonwayAccountId: u.lemonway_account_id ?? null,
      kycValidatedAt: u.kyc_validated_at ?? null,
      sahCreatedAt: u.sah_created_at ?? null,
      sahUpdatedAt: u.sah_updated_at ?? null,
      registrationComplete: u.profil_complet ?? false,
      onboardingComplete: u.onboarding_complet ?? false,
      updatedAt: new Date(),
    };
  });

  // Insertion par lots (limite de paramètres SQL).
  const CHUNK = 500;
  for (let i = 0; i < values.length; i += CHUNK) {
    const batch = values.slice(i, i + CHUNK);
    await db
      .insert(investors)
      .values(batch)
      .onConflictDoUpdate({
        target: investors.sahId,
        set: {
          email: sql`excluded.email`,
          civility: sql`excluded.civility`,
          firstName: sql`excluded.first_name`,
          lastName: sql`excluded.last_name`,
          fullName: sql`excluded.full_name`,
          phone: sql`excluded.phone`,
          dateOfBirth: sql`excluded.date_of_birth`,
          nationality: sql`excluded.nationality`,
          countryResidence: sql`excluded.country_residence`,
          addressStreet: sql`excluded.address_street`,
          addressComplement: sql`excluded.address_complement`,
          addressCity: sql`excluded.address_city`,
          addressPostalCode: sql`excluded.address_postal_code`,
          taxResidencyCountry: sql`excluded.tax_residency_country`,
          bonusCode: sql`excluded.bonus_code`,
          cgpName: sql`excluded.cgp_name`,
          cgpNetwork: sql`excluded.cgp_network`,
          parentSahId: sql`excluded.parent_sah_id`,
          parrainName: sql`excluded.parrain_name`,
          walletBalanceCents: sql`excluded.wallet_balance_cents`,
          walletStatus: sql`excluded.wallet_status`,
          lwOnboardingStatus: sql`excluded.lw_onboarding_status`,
          lwOnboardingId: sql`excluded.lw_onboarding_id`,
          lemonwayAccountId: sql`excluded.lemonway_account_id`,
          kycValidatedAt: sql`excluded.kyc_validated_at`,
          sahCreatedAt: sql`excluded.sah_created_at`,
          sahUpdatedAt: sql`excluded.sah_updated_at`,
          registrationComplete: sql`excluded.registration_complete`,
          onboardingComplete: sql`excluded.onboarding_complete`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  await recomputeBreachLevels();
  return rows.length;
}

/**
 * Attribution BREACH multi-niveaux : part des inscrits BREACH directs (code ~ breach,
 * niveau 0) et descend l'arbre de parrainage (parent_sah_id) niveau par niveau.
 * Recalcul complet (reset puis recompute) — tout cumulé sous breach_level.
 */
async function recomputeBreachLevels(): Promise<void> {
  await db.execute(sql`update investors set breach_level = null where breach_level is not null`);
  await db.execute(sql`
    with recursive net as (
      select id, sah_id, 0 as lvl
      from investors
      where deleted_at is null and bonus_code ilike '%breach%'
      union all
      select c.id, c.sah_id, n.lvl + 1
      from investors c
      join net n on c.parent_sah_id = n.sah_id
      where c.deleted_at is null and n.lvl < 12
    ),
    ranked as (select id, min(lvl) as lvl from net group by id)
    update investors i set breach_level = ranked.lvl
    from ranked
    where ranked.id = i.id
  `);
}

type SahSubscription = {
  id: string;
  user_sah_id: string;
  project_sah_id: string;
  amount: number | null;
  number_of_shares: number | null;
  signed_at: Date | null;
  paid_at: Date | null;
  canceled_at: Date | null;
  transfered_at: Date | null;
};

/** Statut souscription dérivé des dates SAH (pas de colonne status dédiée). */
function mapSubscriptionStatus(s: SahSubscription): 'signed' | 'paid' | 'cancelled' {
  if (s.canceled_at) return 'cancelled';
  if (s.paid_at || s.transfered_at) return 'paid';
  return 'signed';
}

/**
 * @param onlyNew true = insère uniquement les nouvelles souscriptions (les existantes
 *   ne sont jamais retouchées : elles sont figées côté SAH). false = upsert complet.
 */
async function syncSubscriptions(onlyNew = false): Promise<number> {
  const sahDb = getSahClient();
  // La souscription se relie à l'investisseur via users_profiles.user_id, et au projet
  // via project_id. On ne garde que les souscriptions dont l'investisseur ET le projet
  // sont déjà synchronisés chez nous.
  const rows = await sahDb<SahSubscription[]>`
    select
      s.id::text as id,
      up.user_id::text as user_sah_id,
      s.project_id::text as project_sah_id,
      s.amount,
      s.number_of_shares,
      s.signed_at,
      s.paid_at,
      s.canceled_at,
      s.transfered_at
    from subscriptions s
    join users_profiles up on up.id = s.users_profile_id
    where s.users_profile_id is not null and s.project_id is not null
  `;
  if (rows.length === 0) return 0;

  // Tables de correspondance sah_id → notre uuid (investisseurs + projets).
  const [invRows, projRows] = await Promise.all([
    db.select({ id: investors.id, sahId: investors.sahId }).from(investors),
    db.select({ id: projects.id, sahId: projects.sahId }).from(projects),
  ]);
  const invBySah = new Map(invRows.map((r) => [r.sahId, r.id]));
  const projBySah = new Map(projRows.map((r) => [r.sahId, r.id]));

  const values = rows
    .map((s) => {
      const investorId = invBySah.get(s.user_sah_id);
      const projectId = projBySah.get(s.project_sah_id);
      if (!investorId || !projectId) return null; // investisseur/projet non synchronisé
      return {
        sahId: s.id,
        investorId,
        projectId,
        amount: s.amount != null ? String(s.amount) : '0',
        sharesCount: s.number_of_shares ?? null,
        signedAt: s.signed_at ?? null,
        paidAt: s.paid_at ?? null,
        canceledAt: s.canceled_at ?? null,
        status: mapSubscriptionStatus(s),
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
  if (values.length === 0) return 0;

  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < values.length; i += CHUNK) {
    const batch = values.slice(i, i + CHUNK);
    const base = db.insert(subscriptions).values(batch);
    // Souscriptions figées : en mode "nouvelles seulement" on n'écrase jamais l'existant.
    const inserted = onlyNew
      ? await base.onConflictDoNothing({ target: subscriptions.sahId }).returning({
          id: subscriptions.id,
        })
      : await base
          .onConflictDoUpdate({
            target: subscriptions.sahId,
            set: {
              investorId: sql`excluded.investor_id`,
              projectId: sql`excluded.project_id`,
              amount: sql`excluded.amount`,
              sharesCount: sql`excluded.shares_count`,
              signedAt: sql`excluded.signed_at`,
              paidAt: sql`excluded.paid_at`,
              canceledAt: sql`excluded.canceled_at`,
              status: sql`excluded.status`,
            },
          })
          .returning({ id: subscriptions.id });
    written += inserted.length;
  }

  return onlyNew ? written : values.length;
}

/**
 * Périmètre de synchro :
 * - `light` (15 min) : projets + investisseurs (ce qui évolue : nouveaux inscrits, statuts).
 * - `subscriptions` (4 h) : insère uniquement les NOUVELLES souscriptions (figées).
 * - `full` (manuel) : tout, avec upsert complet des souscriptions.
 */
export type SyncScope = 'light' | 'subscriptions' | 'full';

export async function runSahSync(scope: SyncScope = 'full'): Promise<SyncResult> {
  const errors: string[] = [];
  let projectsCount = 0;
  let investorsCount = 0;
  let subscriptionsCount = 0;

  if (scope === 'light' || scope === 'full') {
    try {
      projectsCount = await syncProjects();
    } catch (e) {
      errors.push(`projets: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      investorsCount = await syncInvestors();
    } catch (e) {
      errors.push(`investisseurs: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (scope === 'subscriptions' || scope === 'full') {
    // Dépend des investisseurs + projets déjà synchronisés.
    // En `subscriptions` (cron 4h) : nouvelles seulement. En `full` : upsert complet.
    try {
      subscriptionsCount = await syncSubscriptions(scope === 'subscriptions');
    } catch (e) {
      errors.push(`souscriptions: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    projects: projectsCount,
    investors: investorsCount,
    subscriptions: subscriptionsCount,
    errors,
  };
}
