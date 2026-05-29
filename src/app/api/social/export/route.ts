import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { socialIdeas, socialPosts } from '@/lib/db/schema';
import { buildMetricoolCsv, type MetricoolPost } from '@/lib/integrations/metricool/export';
import { publicImageUrl } from '@/lib/social/storage';

export async function GET(): Promise<Response> {
  // Seuls les posts "prêts" sont exportés.
  const rows = await db
    .select({
      id: socialPosts.id,
      text: socialPosts.text,
      platform: socialPosts.platform,
      isCarousel: socialPosts.isCarousel,
      imagePath: socialPosts.imagePath,
      noImage: socialPosts.noImage,
      scheduledDate: socialPosts.scheduledDate,
      scheduledTime: socialPosts.scheduledTime,
      ideaTitle: socialIdeas.title,
    })
    .from(socialPosts)
    .leftJoin(socialIdeas, eq(socialIdeas.id, socialPosts.ideaId))
    .where(eq(socialPosts.status, 'ready'))
    .orderBy(asc(socialPosts.scheduledDate));

  const posts: MetricoolPost[] = [];
  for (const r of rows) {
    const imageUrls: string[] = [];
    if (r.isCarousel) {
      // Pour un carrousel, on n'a pas d'images bitmap par slide (visuels HTML/CSS) :
      // on exporte l'éventuelle image de fond si présente.
      if (!r.noImage && r.imagePath) imageUrls.push(publicImageUrl(r.imagePath));
    } else if (!r.noImage && r.imagePath) {
      imageUrls.push(publicImageUrl(r.imagePath));
    }
    posts.push({
      text: r.text,
      platform: r.platform,
      scheduledDate: r.scheduledDate,
      scheduledTime: r.scheduledTime,
      isCarousel: r.isCarousel,
      title: r.ideaTitle,
      imageUrls,
    });
  }

  const csv = buildMetricoolCsv(posts);
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="sah-social-metricool.csv"',
    },
  });
}
