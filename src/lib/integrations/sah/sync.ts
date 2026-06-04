import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { investors, projects } from '@/lib/db/schema';
import { getSahClient } from './client';

/**
 * Synchronisation SAH (réplique lecture seule) → notre Supabase.
 * On ne lit QUE les colonnes non sensibles (jamais IBAN, scans, mots de passe).
 * Upsert sur `sah_id` : on met à jour les champs venus de SAH, sans toucher aux
 * champs internes (score, pipeline, closer assigné…).
 */

export type SyncResult = { projects: number; investors: number; errors: string[] };

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
};

async function syncProjects(): Promise<number> {
  const sahDb = getSahClient();
  const rows = await sahDb<SahProject[]>`
    select id::text, name, status, maximum_targeted_amount,
           estimated_annual_profitability::text, investment_duration,
           collect_starts_at, closing_date, city, short_description
    from projects
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
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  birthdate: string | null;
  city: string | null;
  zip_code: string | null;
  profil_complet: boolean | null;
  onboarding_complet: boolean | null;
};

async function syncInvestors(): Promise<number> {
  const sahDb = getSahClient();
  // Un investisseur = une personne (users). Le statut profil/KYC vit sur users_profiles
  // (une personne peut avoir plusieurs profils) → on agrège au "plus avancé".
  const rows = await sahDb<SahInvestor[]>`
    select
      u.id::text,
      u.email,
      u.first_name,
      u.last_name,
      u.phone_number,
      u.birthdate::text,
      u.city,
      u.zip_code,
      bool_or(p.status = 'validate') as profil_complet,
      bool_or(p.wallet_status = '6' or p.lw_onboarding_status = 'accepted') as onboarding_complet
    from users u
    left join users_profiles p on p.user_id = u.id
    where u.email is not null
    group by u.id, u.email, u.first_name, u.last_name, u.phone_number, u.birthdate, u.city, u.zip_code
  `;
  if (rows.length === 0) return 0;

  const values = rows.map((u) => {
    const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || null;
    return {
      sahId: u.id,
      email: u.email,
      firstName: u.first_name ?? null,
      lastName: u.last_name ?? null,
      fullName,
      phone: u.phone_number ?? null,
      dateOfBirth: u.birthdate ?? null,
      addressCity: u.city ?? null,
      addressPostalCode: u.zip_code ?? null,
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
          firstName: sql`excluded.first_name`,
          lastName: sql`excluded.last_name`,
          fullName: sql`excluded.full_name`,
          phone: sql`excluded.phone`,
          dateOfBirth: sql`excluded.date_of_birth`,
          addressCity: sql`excluded.address_city`,
          addressPostalCode: sql`excluded.address_postal_code`,
          registrationComplete: sql`excluded.registration_complete`,
          onboardingComplete: sql`excluded.onboarding_complete`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  return rows.length;
}

/** Lance la synchro complète (projets puis investisseurs). */
export async function runSahSync(): Promise<SyncResult> {
  const errors: string[] = [];
  let projectsCount = 0;
  let investorsCount = 0;

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

  return { projects: projectsCount, investors: investorsCount, errors };
}
