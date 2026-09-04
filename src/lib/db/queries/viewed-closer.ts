import 'server-only';
import type { AuthenticatedUser } from '@/lib/auth';
import { type CloserOption, getClosers } from './closing';

/**
 * « Vue closer » : un closer ne voit que son poste ; l'admin (et la direction)
 * peuvent ouvrir celui de n'importe quel closer via `?closer=<id>` — pour
 * voir exactement ce qu'il voit, sans rien prendre à sa place.
 *
 * Un closer qui forge l'URL avec l'id d'un collègue est ramené sur le sien.
 */
export type ViewedCloser = {
  viewedId: string;
  viewedName: string | null;
  /** On regarde son propre poste. */
  isMine: boolean;
  canPick: boolean;
  /** Closers d'abord, admins ensuite. */
  pickable: CloserOption[];
};

export async function resolveViewedCloser(
  user: AuthenticatedUser,
  requested?: string,
): Promise<ViewedCloser> {
  const canPick = user.role === 'admin' || user.role === 'executive';
  if (!canPick) {
    return { viewedId: user.id, viewedName: null, isMine: true, canPick: false, pickable: [] };
  }
  const pickable = [...(await getClosers())].sort((a, b) =>
    a.role === b.role ? (a.name ?? '').localeCompare(b.name ?? '') : a.role === 'admin' ? 1 : -1,
  );
  const wanted = requested ? pickable.find((c) => c.id === requested) : undefined;
  // L'admin retombe sur lui-même ; la direction (jamais closer) sur le premier closer.
  const fallbackId = user.role === 'admin' ? user.id : (pickable[0]?.id ?? user.id);
  const viewedId = wanted?.id ?? fallbackId;
  return {
    viewedId,
    viewedName: pickable.find((c) => c.id === viewedId)?.name ?? null,
    isMine: viewedId === user.id,
    canPick: true,
    pickable,
  };
}
