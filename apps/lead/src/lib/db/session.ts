import { sql } from 'drizzle-orm';
import { db } from './index';

/**
 * Périmètre d'une requête, tel que la base le voit.
 *
 * - `admin`  : tout.
 * - `setter` : les sources de son périmètre (`sourceIds`).
 * - `buyer`  : UN acheteur (`buyerId`) — les politiques RLS ne laissent passer
 *              que ses rendez-vous, packs, factures, connexion Calendly.
 * - `system` : jobs, webhooks, crons — pas d'utilisateur humain.
 */
export type DbScope =
  | { role: 'admin'; userId: string }
  | { role: 'setter'; userId: string; sourceIds: string[] }
  | { role: 'buyer'; userId: string | null; buyerId: string; onBehalfOf?: string }
  | { role: 'system' };

/** Client transactionnel Drizzle (type de `db.transaction`). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Exécute `fn` dans une transaction où le rôle et le périmètre sont posés via
 * `set_config(…, true)` : la valeur meurt avec la transaction, ce qui la rend
 * sûre derrière un pooler en mode transaction. C'est LA porte d'entrée de
 * toute lecture / écriture métier.
 */
export async function withDbSession<T>(scope: DbScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const buyerId = scope.role === 'buyer' ? scope.buyerId : '';
    const userId = scope.role === 'system' ? '' : (scope.userId ?? '');
    const sourceIds = scope.role === 'setter' ? JSON.stringify(scope.sourceIds) : '[]';
    await tx.execute(sql`
      select
        set_config('app.role', ${scope.role}, true),
        set_config('app.buyer_id', ${buyerId}, true),
        set_config('app.user_id', ${userId}, true),
        set_config('app.source_ids', ${sourceIds}, true)
    `);
    return fn(tx);
  });
}

/** Raccourci pour les jobs, webhooks et crons. */
export function asSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withDbSession({ role: 'system' }, fn);
}
