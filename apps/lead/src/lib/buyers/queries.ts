import 'server-only';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { type AuthenticatedUser, scopeFor } from '@/lib/auth';
import { appointments, buyers, buyerUsers, packs, sources } from '@/lib/db/schema';
import { withDbSession } from '@/lib/db/session';

export type BuyerListItem = {
  buyer: typeof buyers.$inferSelect;
  sourceName: string;
  packRemaining: number | null;
  packIsPilot: boolean;
  rdvPosed: number;
  rdvBillable: number;
};

export async function listBuyers(user: AuthenticatedUser): Promise<BuyerListItem[]> {
  return withDbSession(scopeFor(user), async (tx) => {
    const rows = await tx
      .select({ buyer: buyers, sourceName: sources.name })
      .from(buyers)
      .innerJoin(sources, eq(sources.id, buyers.sourceId))
      .orderBy(asc(buyers.priority), asc(buyers.name));
    const out: BuyerListItem[] = [];
    for (const r of rows) {
      const pack = await tx
        .select({ remaining: packs.remaining, isPilot: packs.isPilot })
        .from(packs)
        .where(and(eq(packs.buyerId, r.buyer.id), eq(packs.status, 'actif')))
        .orderBy(asc(packs.createdAt))
        .limit(1);
      const [posed] = await tx
        .select({ n: count() })
        .from(appointments)
        .where(
          and(
            eq(appointments.buyerId, r.buyer.id),
            inArray(appointments.status, ['pose', 'honore']),
          ),
        );
      const [billable] = await tx
        .select({ n: count() })
        .from(appointments)
        .where(and(eq(appointments.buyerId, r.buyer.id), eq(appointments.billable, true)));
      out.push({
        buyer: r.buyer,
        sourceName: r.sourceName,
        packRemaining: pack[0]?.remaining ?? null,
        packIsPilot: pack[0]?.isPilot ?? false,
        rdvPosed: Number(posed?.n ?? 0),
        rdvBillable: Number(billable?.n ?? 0),
      });
    }
    return out;
  });
}

export async function getBuyer(user: AuthenticatedUser, id: string) {
  return withDbSession(scopeFor(user), async (tx) => {
    const rows = await tx
      .select({ buyer: buyers, sourceName: sources.name })
      .from(buyers)
      .innerJoin(sources, eq(sources.id, buyers.sourceId))
      .where(eq(buyers.id, id))
      .limit(1);
    const found = rows[0];
    if (!found) return null;
    const [packRows, userRows] = await Promise.all([
      tx.select().from(packs).where(eq(packs.buyerId, id)).orderBy(desc(packs.createdAt)),
      tx.select().from(buyerUsers).where(eq(buyerUsers.buyerId, id)).orderBy(asc(buyerUsers.email)),
    ]);
    return { ...found, packs: packRows, users: userRows };
  });
}
