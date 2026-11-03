import type postgres from 'postgres';
import type { Queryable } from './service';

/** Adaptateur query(text, params) → { rows } sur un client postgres-js existant. */
export function queryableFrom(client: ReturnType<typeof postgres>): Queryable {
  return {
    query: async (text, params = []) => ({
      rows: [...(await client.unsafe(text, params as postgres.ParameterOrJSON<never>[]))],
    }),
  };
}
