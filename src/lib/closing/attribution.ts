/**
 * Moteur d'attribution — rattache une action (souscription, validation…) au point
 * de contact qui l'a (le plus probablement) déclenchée.
 * Implémente docs/the-pilot-priorisation-performance.md (Partie II).
 *
 * Règles : fenêtre de 30 jours ; l'appel prime sur le last-touch ; sinon last-touch
 * (clic/ouverture le plus récent) ; sinon non attribué.
 */

export type ContactKind = 'call' | 'click' | 'open';

export type Contact = {
  kind: ContactKind;
  at: Date;
  /** Closer à l'origine du contact (pour les appels). */
  userId: string | null;
};

export type AttributionResult = {
  attributed: boolean;
  via: ContactKind | null;
  userId: string | null;
};

const DAY_MS = 86_400_000;

export function attributeAction(
  actionAt: Date,
  contacts: Contact[],
  windowDays = 30,
): AttributionResult {
  const actionTime = new Date(actionAt).getTime();
  const windowStart = actionTime - windowDays * DAY_MS;

  const inWindow = contacts.filter((c) => {
    const t = new Date(c.at).getTime();
    return t <= actionTime && t >= windowStart;
  });
  if (inWindow.length === 0) return { attributed: false, via: null, userId: null };

  const byMostRecent = (a: Contact, b: Contact) =>
    new Date(b.at).getTime() - new Date(a.at).getTime();

  // 1. L'appel prime (le plus récent).
  const calls = inWindow.filter((c) => c.kind === 'call').sort(byMostRecent);
  if (calls[0]) return { attributed: true, via: 'call', userId: calls[0].userId };

  // 2. Sinon last-touch (clic/ouverture le plus récent).
  const others = inWindow.filter((c) => c.kind !== 'call').sort(byMostRecent);
  if (others[0]) return { attributed: true, via: others[0].kind, userId: others[0].userId };

  return { attributed: false, via: null, userId: null };
}
