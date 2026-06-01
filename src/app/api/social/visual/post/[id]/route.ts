import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { getApiUserOrNull } from '@/lib/auth';
import { db } from '@/lib/db';
import { socialIdeas, socialPosts } from '@/lib/db/schema';
import { renderPostCard } from '@/lib/social/sah-visual';
import { imageToDataUri, publicImageUrl } from '@/lib/social/storage';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await getApiUserOrNull())) return new Response('Unauthorized', { status: 401 });

  const { id } = await ctx.params;
  const isExport = req.nextUrl.searchParams.get('export') === '1';

  const rows = await db
    .select({
      platform: socialPosts.platform,
      text: socialPosts.text,
      isCarousel: socialPosts.isCarousel,
      noImage: socialPosts.noImage,
      imagePath: socialPosts.imagePath,
      ideaTitle: socialIdeas.title,
      ideaCategory: socialIdeas.category,
      ideaAngle: socialIdeas.angle,
    })
    .from(socialPosts)
    .leftJoin(socialIdeas, eq(socialIdeas.id, socialPosts.ideaId))
    .where(eq(socialPosts.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return new Response('Not found', { status: 404 });

  let imageDataUri: string | null = null;
  if (!row.noImage && row.imagePath) {
    imageDataUri = isExport ? await imageToDataUri(row.imagePath) : publicImageUrl(row.imagePath);
  }

  const html = renderPostCard(
    {
      platform: row.platform,
      text: row.text,
      isCarousel: row.isCarousel,
      noImage: row.noImage,
      imageDataUri,
    },
    { title: row.ideaTitle, category: row.ideaCategory, angle: row.ideaAngle },
    { export: isExport },
  );

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
