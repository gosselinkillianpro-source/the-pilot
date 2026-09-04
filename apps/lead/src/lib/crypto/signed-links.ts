import 'server-only';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { signedLinks } from '@/lib/db/schema';
import type { Tx } from '@/lib/db/session';
import { appUrl } from '@/lib/env';
import { randomToken, sha256Hex } from './hash';

/**
 * Liens signés envoyés par email / SMS : un jeton aléatoire à usage unique,
 * dont seul le hash est stocké. Un lien vaut pour UN objet (un RDV, un lead)
 * et UNE finalité, avec une date d'expiration.
 */
export type SignedLinkPurpose = 'buyer_validation' | 'reschedule' | 'slot_pick' | 'reroute_consent';

const PATHS: Record<SignedLinkPurpose, string> = {
  buyer_validation: '/v',
  reschedule: '/r',
  slot_pick: '/c',
  reroute_consent: '/consentement',
};

export async function createSignedLink(
  tx: Tx,
  input: {
    purpose: SignedLinkPurpose;
    leadId?: string;
    appointmentId?: string;
    buyerId?: string;
    ttlHours: number;
  },
): Promise<{ url: string; token: string }> {
  const token = randomToken(32);
  await tx.insert(signedLinks).values({
    tokenHash: sha256Hex(token),
    purpose: input.purpose,
    leadId: input.leadId ?? null,
    appointmentId: input.appointmentId ?? null,
    buyerId: input.buyerId ?? null,
    expiresAt: new Date(Date.now() + input.ttlHours * 3600 * 1000),
  });
  return { token, url: `${appUrl()}${PATHS[input.purpose]}/${token}` };
}

export type SignedLinkRow = typeof signedLinks.$inferSelect;

/** Renvoie le lien s'il est valide (bonne finalité, non expiré). `consume` le marque utilisé. */
export async function resolveSignedLink(
  tx: Tx,
  token: string,
  purpose: SignedLinkPurpose,
  options: { consume?: boolean } = {},
): Promise<SignedLinkRow | null> {
  const rows = await tx
    .select()
    .from(signedLinks)
    .where(
      and(
        eq(signedLinks.tokenHash, sha256Hex(token)),
        eq(signedLinks.purpose, purpose),
        gt(signedLinks.expiresAt, new Date()),
        ...(options.consume ? [isNull(signedLinks.usedAt)] : []),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (options.consume) {
    await tx.update(signedLinks).set({ usedAt: new Date() }).where(eq(signedLinks.id, row.id));
  }
  return row;
}
