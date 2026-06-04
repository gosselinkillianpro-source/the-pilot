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
