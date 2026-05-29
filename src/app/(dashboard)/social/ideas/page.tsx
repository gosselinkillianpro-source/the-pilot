import { desc, eq, sql } from 'drizzle-orm';
import Link from 'next/link';
import { SAH_CATEGORY_LABELS, type SahIdeaCategory } from '@/lib/ai/prompts/sah-brand';
import { db } from '@/lib/db';
import { socialIdeas } from '@/lib/db/schema';
import { getSocialConfig } from '@/lib/social/settings';
import {
  ClearRejectedButton,
  GenerateIdeasButton,
  IdeaActions,
  IdeaSearch,
  MixEditor,
  ValidateAllButton,
} from './ideas-client';

export const dynamic = 'force-dynamic';
// La génération via Grok est synchrone (~20-40s) : on laisse de la marge.
export const maxDuration = 120;

type Filter = 'pending' | 'validated' | 'rejected' | 'priority' | 'all';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pending', label: 'En attente' },
  { key: 'validated', label: 'Validées' },
  { key: 'rejected', label: 'Rejetées' },
  { key: 'priority', label: 'Favoris' },
  { key: 'all', label: 'Toutes' },
];

function categoryLabel(cat: string | null): string {
  if (cat && cat in SAH_CATEGORY_LABELS) return SAH_CATEGORY_LABELS[cat as SahIdeaCategory];
  return cat ?? '—';
}

export default async function SocialIdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter: Filter = (FILTERS.find((f) => f.key === status)?.key ?? 'pending') as Filter;

  const baseQuery = db.select().from(socialIdeas);
  const ideas =
    filter === 'all'
      ? await baseQuery.orderBy(desc(socialIdeas.priority), desc(socialIdeas.createdAt))
      : filter === 'priority'
        ? await baseQuery.where(eq(socialIdeas.priority, true)).orderBy(desc(socialIdeas.createdAt))
        : await baseQuery
            .where(eq(socialIdeas.status, filter))
            .orderBy(desc(socialIdeas.priority), desc(socialIdeas.createdAt));

  const countsRows = await db
    .select({
      status: socialIdeas.status,
      priority: socialIdeas.priority,
      c: sql<number>`count(*)::int`,
    })
    .from(socialIdeas)
    .groupBy(socialIdeas.status, socialIdeas.priority);

  const counts = {
    pending: 0,
    validated: 0,
    rejected: 0,
    priority: 0,
    all: 0,
  };
  for (const r of countsRows) {
    counts.all += r.c;
    if (r.status === 'pending') counts.pending += r.c;
    if (r.status === 'validated') counts.validated += r.c;
    if (r.status === 'rejected') counts.rejected += r.c;
    if (r.priority) counts.priority += r.c;
  }

  // Répartition réelle des idées validées par catégorie (pour comparer à la cible)
  const catRows = await db
    .select({ category: socialIdeas.category, c: sql<number>`count(*)::int` })
    .from(socialIdeas)
    .where(eq(socialIdeas.status, 'validated'))
    .groupBy(socialIdeas.category);
  const totalValidated = catRows.reduce((acc, r) => acc + r.c, 0) || 1;
  const pct = (cat: string) => {
    const found = catRows.find((r) => r.category === cat);
    return found ? Math.round((found.c / totalValidated) * 100) : 0;
  };
  const actual = {
    projets: pct('projets'),
    pedagogique: pct('pedagogique'),
    temoignages: pct('temoignages'),
    mise_avant: pct('mise_avant'),
  };

  const config = await getSocialConfig();

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
        }}
      >
        <div>
          <h1 className="page-title">Idées de contenu</h1>
          <div className="page-desc">
            Grok cherche l'actu immo + concurrents + ton contexte SAH. Valide les idées qui te
            plaisent : elles deviendront des posts.
          </div>
        </div>
        <GenerateIdeasButton />
      </div>

      <MixEditor
        initialMix={config.mix}
        initialPostsPerWeek={config.postsPerWeek}
        actual={actual}
      />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/social/ideas?status=${f.key}`}
            className={`badge ${filter === f.key ? 'badge-ai' : 'badge-neutral'}`}
            style={{ textDecoration: 'none' }}
          >
            {f.label} · {counts[f.key]}
          </Link>
        ))}
        <div style={{ flex: 1 }} />
        <IdeaSearch />
        {filter === 'pending' && <ValidateAllButton count={counts.pending} />}
        {filter === 'rejected' && <ClearRejectedButton count={counts.rejected} />}
      </div>

      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">{ideas.length} idée(s)</div>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {ideas.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
              {filter === 'pending'
                ? 'Aucune idée en attente. Clique sur « Générer » en haut à droite.'
                : 'Aucune idée dans ce filtre.'}
            </div>
          ) : (
            ideas.map((idea, idx) => (
              <div
                key={idea.id}
                data-idea-row
                data-haystack={`${idea.title} ${idea.angle} ${idea.rationale ?? ''}`.toLowerCase()}
                style={{
                  display: 'flex',
                  gap: 16,
                  padding: '16px 20px',
                  borderBottom: idx < ideas.length - 1 ? '1px solid var(--border)' : 'none',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                      {idea.title}
                    </span>
                    <span className="badge badge-neutral">{categoryLabel(idea.category)}</span>
                    {idea.status === 'validated' && (
                      <span className="badge badge-success">Validée</span>
                    )}
                    {idea.status === 'rejected' && (
                      <span className="badge badge-danger">Rejetée</span>
                    )}
                    {idea.fromCompetitor && (
                      <span className="badge badge-ai">veille · {idea.fromCompetitor}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                    {idea.angle}
                  </div>
                  {idea.rationale && (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                      📌 {idea.rationale}
                    </div>
                  )}
                </div>
                <IdeaActions ideaId={idea.id} status={idea.status} priority={idea.priority} />
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
