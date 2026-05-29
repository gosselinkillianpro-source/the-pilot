/**
 * Stockage des images générées (Nano Banana) dans Supabase Storage (bucket EU).
 * L'image elle-même n'est pas une donnée personnelle : visuel marketing.
 *
 * Le bucket "social-visuals" doit exister (public). Si Storage n'est pas configuré,
 * les fonctions lèvent une erreur claire ; le mode visuel HTML/CSS reste l'option par défaut.
 */

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'social-visuals';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase Storage non configuré (URL ou SERVICE_ROLE_KEY manquante).');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Upload un buffer image, retourne le chemin de stockage (clé dans le bucket). */
export async function uploadSocialImage(
  buffer: Buffer,
  mime: string,
  filenameHint: string,
): Promise<string> {
  const client = serviceClient();
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpeg';
  const path = `${filenameHint}-${Date.now()}.${ext}`;
  const { error } = await client.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw new Error(`Upload image échoué : ${error.message}`);
  return path;
}

/** URL publique d'une image stockée. */
export function publicImageUrl(path: string): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** Télécharge une image stockée et la renvoie en data URI base64 (pour export autonome). */
export async function imageToDataUri(path: string): Promise<string | null> {
  try {
    const client = serviceClient();
    const { data, error } = await client.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    const buffer = Buffer.from(await data.arrayBuffer());
    const mime = data.type || 'image/jpeg';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}
