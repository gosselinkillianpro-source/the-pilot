import { eq } from 'drizzle-orm';
import { getApiUserOrNull } from '@/lib/auth';
import { db } from '@/lib/db';
import { socialPosts } from '@/lib/db/schema';
import { imageToDataUri } from '@/lib/social/storage';

/** Télécharge l'image brute (fichier original) d'un post. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await getApiUserOrNull())) return new Response('Unauthorized', { status: 401 });

  const { id } = await ctx.params;
  const rows = await db
    .select({ imagePath: socialPosts.imagePath, platform: socialPosts.platform })
    .from(socialPosts)
    .where(eq(socialPosts.id, id))
    .limit(1);
  const row = rows[0];
  if (!row?.imagePath) return new Response("Pas d'image", { status: 404 });

  const dataUri = await imageToDataUri(row.imagePath);
  if (!dataUri) return new Response('Image introuvable', { status: 404 });

  const match = dataUri.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return new Response('Format invalide', { status: 500 });
  const mime = match[1] ?? 'image/jpeg';
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpeg';
  const buffer = Buffer.from(match[2] ?? '', 'base64');

  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': mime,
      'content-disposition': `attachment; filename="sah-${row.platform}-${id.slice(0, 8)}.${ext}"`,
    },
  });
}
