import type { AuthenticatedUser } from './index';

export async function assertCanWriteInvestor(
  user: AuthenticatedUser,
  investor: { assignedCloserId: string | null },
): Promise<void> {
  if (user.role === 'admin') return;
  if (user.role === 'closer' && investor.assignedCloserId === user.id) return;
  if (user.role === 'closer_junior' && investor.assignedCloserId === user.id) return;
  throw new Error('FORBIDDEN: cannot write this investor');
}

export async function assertCanReadInvestor(
  user: AuthenticatedUser,
  investor: { assignedCloserId: string | null },
): Promise<void> {
  if (user.role === 'admin' || user.role === 'executive') return;
  if (investor.assignedCloserId === user.id) return;
  throw new Error('FORBIDDEN: cannot read this investor');
}
