import { asc, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { socialCarouselSlides, socialIdeas, socialPosts } from '@/lib/db/schema';
import { renderSlide, type SlideData } from '@/lib/social/sah-visual';
import { imageToDataUri, publicImageUrl } from '@/lib/social/storage';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; idx: string }> },
): Promise<Response> {
  const { id, idx } = await ctx.params;
  const slideIndex = Number.parseInt(idx, 10);
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

  const slides = await db
    .select()
    .from(socialCarouselSlides)
    .where(eq(socialCarouselSlides.postId, id))
    .orderBy(asc(socialCarouselSlides.slideIndex));

  if (slides.length === 0 || slideIndex < 0 || slideIndex >= slides.length) {
    return new Response('Slide not found', { status: 404 });
  }

  const slideRow = slides[slideIndex];
  if (!slideRow) return new Response('Slide not found', { status: 404 });
  const extra = (slideRow.extra ?? {}) as Record<string, unknown>;
  const slide: SlideData = {
    ...extra,
    title: slideRow.title,
    body: slideRow.body ?? undefined,
  };

  let imageDataUri: string | null = null;
  if (!row.noImage && row.imagePath) {
    imageDataUri = isExport ? await imageToDataUri(row.imagePath) : publicImageUrl(row.imagePath);
  }

  const html = renderSlide(
    slide,
    slideIndex,
    slides.length,
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
