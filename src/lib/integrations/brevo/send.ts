/**
 * Envoi & gestion de listes Brevo — côté serveur uniquement.
 */

const BASE = 'https://api.brevo.com/v3';

function brevoHeaders(): HeadersInit {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY manquante (voir .env.local)');
  return {
    'api-key': key,
    accept: 'application/json',
    'content-type': 'application/json',
  };
}

async function brevoPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: brevoHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo ${res.status} sur ${path} : ${text.slice(0, 300)}`);
  }
  return res.json().catch(() => ({})) as Promise<T>;
}

async function brevoPut(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: brevoHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo ${res.status} sur ${path} : ${text.slice(0, 300)}`);
  }
}

async function brevoGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: brevoHeaders(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Brevo ${res.status} sur ${path}`);
  return res.json() as Promise<T>;
}

export type SendTransactionalInput = {
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
  senderName: string;
  senderAddress: string;
};

export async function sendTransactionalEmail(
  input: SendTransactionalInput,
): Promise<{ messageId: string }> {
  return brevoPost<{ messageId: string }>('/smtp/email', {
    sender: { name: input.senderName, email: input.senderAddress },
    to: input.to,
    subject: input.subject,
    htmlContent: input.htmlContent,
  });
}

async function getOrCreateFolderId(): Promise<number> {
  const data = await brevoGet<{ folders?: { id: number; name: string }[] }>(
    '/contacts/folders?limit=10',
  );
  const existing = data.folders?.[0];
  if (existing) return existing.id;
  const created = await brevoPost<{ id: number }>('/contacts/folders', { name: 'THE PILOT' });
  return created.id;
}

export async function createBrevoList(name: string): Promise<{ id: number }> {
  const folderId = await getOrCreateFolderId();
  return brevoPost<{ id: number }>('/contacts/lists', { name, folderId });
}

export async function addContactsToList(listId: number, emails: string[]): Promise<void> {
  // Crée/maj les contacts puis les ajoute à la liste
  await brevoPost(`/contacts/lists/${listId}/contacts/add`, { emails });
}

/** Crée les contacts s'ils n'existent pas (sinon l'ajout à une liste peut échouer). */
export async function ensureContacts(emails: string[]): Promise<void> {
  for (const email of emails) {
    try {
      await brevoPost('/contacts', { email, updateEnabled: true });
    } catch {
      // déjà existant ou erreur non bloquante — l'ajout à la liste gérera
    }
  }
}

/** Crée (ou met à jour si déjà présent) un contact avec ses attributs et listes. */
export async function upsertBrevoContact(input: {
  email: string;
  attributes?: Record<string, unknown>;
  listIds?: number[];
}): Promise<void> {
  await brevoPost('/contacts', {
    email: input.email,
    attributes: input.attributes,
    listIds: input.listIds,
    updateEnabled: true,
  });
}

/** Met à jour un contact existant (attributs, ajout/retrait de listes). */
export async function updateBrevoContact(
  identifier: string,
  input: { attributes?: Record<string, unknown>; listIds?: number[]; unlinkListIds?: number[] },
): Promise<void> {
  await brevoPut(`/contacts/${encodeURIComponent(identifier)}`, {
    attributes: input.attributes,
    listIds: input.listIds,
    unlinkListIds: input.unlinkListIds,
  });
}

/** Retire des contacts d'une liste. */
export async function removeContactsFromList(listId: number, emails: string[]): Promise<void> {
  await brevoPost(`/contacts/lists/${listId}/contacts/remove`, { emails });
}

/**
 * Crée une campagne email Brevo. Sans `scheduledAt` et sans envoi explicite,
 * elle reste en BROUILLON (aucun email envoyé). L'envoi est une action séparée.
 */
export async function createBrevoCampaign(input: {
  name: string;
  subject: string;
  htmlContent: string;
  senderName: string;
  senderAddress: string;
  listIds: number[];
  scheduledAt?: string; // ISO ; si absent → brouillon
}): Promise<{ id: number }> {
  const body: Record<string, unknown> = {
    name: input.name,
    subject: input.subject,
    sender: { name: input.senderName, email: input.senderAddress },
    htmlContent: input.htmlContent,
    recipients: { listIds: input.listIds },
  };
  if (input.scheduledAt) body.scheduledAt = input.scheduledAt;
  return brevoPost<{ id: number }>('/emailCampaigns', body);
}

/** Envoie immédiatement une campagne existante (sortie du brouillon). À gater côté appelant. */
export async function sendBrevoCampaignNow(campaignId: number): Promise<void> {
  await brevoPost(`/emailCampaigns/${campaignId}/sendNow`, {});
}
