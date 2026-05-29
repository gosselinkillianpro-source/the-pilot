import { and, desc, eq, sql } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/lib/db';
import { socialCarouselSlides, socialIdeas, socialPosts } from '@/lib/db/schema';
import { PostCard, type PostCardData } from './posts-client';

export const dynamic = 'force-dynamic';

type StatusFilter = 'all' | 'draft' | 'ready' | 'published';
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'draft', label: 'Brouillons' },
  { key: 'ready', label: 'Prêts' },
  { key: 'published', label: 'Publiés' },
];

export default async function SocialPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; platform?: string }>;
}) {
  const { status, platform } = await searchParams;
  const statusFilter: StatusFilter = (STATUS_FILTERS.find((f) => f.key === status)?.key ??
    'all') as StatusFilter;
  const platformFilter = ['facebook', 'instagram', 'linkedin'].includes(platform ?? '')
    ? platform
    : 'all';

  const conditions = [];
  if (statusFilter !== 'all') conditions.push(eq(socialPosts.status, statusFilter));
  if (platformFilter !== 'all')
    conditions.push(
      eq(socialPosts.platform, platformFilter as 'facebook' | 'instagram' | 'linkedin'),
    );

  const rows = await db
    .select({
      id: socialPosts.id,
      platform: socialPosts.platform,
      text: socialPosts.text,
      isCarousel: socialPosts.isCarousel,
      noImage: socialPosts.noImage,
      imagePath: socialPosts.imagePath,
      status: socialPosts.status,
      amfPassed: socialPosts.amfPassed,
      amfIssues: socialPosts.amfIssues,
      scheduledDate: socialPosts.scheduledDate,
      scheduledTime: socialPosts.scheduledTime,
      updatedAt: socialPosts.updatedAt,
      ideaTitle: socialIdeas.title,
      slidesCount: sql<number>`(select count(*)::int from ${socialCarouselSlides} where ${socialCarouselSlides.postId} = ${socialPosts.id})`,
    })
    .from(socialPosts)
    .leftJoin(socialIdeas, eq(socialIdeas.id, socialPosts.ideaId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(socialPosts.createdAt));

  const counts = await db
    .select({ status: socialPosts.status, c: sql<number>`count(*)::int` })
    .from(socialPosts)
    .groupBy(socialPosts.status);
  const countBy = { all: 0, draft: 0, ready: 0, published: 0 };
  for (const r of counts) {
    countBy.all += r.c;
    if (r.status in countBy) countBy[r.status as keyof typeof countBy] += r.c;
  }

  const posts: PostCardData[] = rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    text: r.text,
    isCarousel: r.isCarousel,
    noImage: r.noImage,
    hasImage: Boolean(r.imagePath),
    status: r.status,
    amfPassed: r.amfPassed,
    amfIssues: Array.isArray(r.amfIssues) ? (r.amfIssues as { match: string }[]) : [],
    scheduledDate: r.scheduledDate,
    scheduledTime: r.scheduledTime,
    ideaTitle: r.ideaTitle,
    slidesCount: r.slidesCount ?? 0,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <>
      <div>
        <h1 className="page-title">Posts</h1>
        <div className="page-desc">
          Pour chaque idée validée : 3 posts (FB/IG/LinkedIn) + visuel premium SAH. Édite, scan AMF,
          copie le HTML/CSS pour Figma, marque « prêt » pour l'export.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/social/posts?status=${f.key}${platformFilter !== 'all' ? `&platform=${platformFilter}` : ''}`}
            className={`badge ${statusFilter === f.key ? 'badge-ai' : 'badge-neutral'}`}
            style={{ textDecoration: 'none' }}
          >
            {f.label} · {countBy[f.key]}
          </Link>
        ))}
        <div style={{ width: 12 }} />
        {['all', 'facebook', 'instagram', 'linkedin'].map((p) => (
          <Link
            key={p}
            href={`/social/posts?status=${statusFilter}${p !== 'all' ? `&platform=${p}` : ''}`}
            className={`badge ${platformFilter === p ? 'badge-brand' : 'badge-neutral'}`}
            style={{ textDecoration: 'none' }}
          >
            {p === 'all' ? 'Toutes plateformes' : p}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <div className="view-card">
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
            Aucun post. Va sur <Link href="/social/ideas">Idées</Link>, valide une idée puis génère
            ses posts.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 16,
          }}
        >
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </>
  );
}
