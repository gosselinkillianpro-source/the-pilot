import { asc, desc, eq } from 'drizzle-orm';
import { Download } from 'lucide-react';
import { db } from '@/lib/db';
import { socialContextNotes, socialIdeas, socialPosts } from '@/lib/db/schema';
import { AddNoteForm, NoteEditor } from './calendar-client';

export const dynamic = 'force-dynamic';

const PLATFORM_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
};

export default async function CalendarPage() {
  const readyPosts = await db
    .select({
      id: socialPosts.id,
      platform: socialPosts.platform,
      isCarousel: socialPosts.isCarousel,
      scheduledDate: socialPosts.scheduledDate,
      scheduledTime: socialPosts.scheduledTime,
      text: socialPosts.text,
      ideaTitle: socialIdeas.title,
    })
    .from(socialPosts)
    .leftJoin(socialIdeas, eq(socialIdeas.id, socialPosts.ideaId))
    .where(eq(socialPosts.status, 'ready'))
    .orderBy(asc(socialPosts.scheduledDate), asc(socialPosts.scheduledTime));

  const notes = await db
    .select()
    .from(socialContextNotes)
    .orderBy(desc(socialContextNotes.updatedAt));

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
          <h1 className="page-title">Calendrier & export</h1>
          <div className="page-desc">
            Les posts marqués « prêt » sont exportables au format Metricool. Les notes de contexte
            alimentent chaque génération IA.
          </div>
        </div>
        <a className="btn btn-ai" href="/api/social/export" download>
          <Download size={14} /> Export CSV Metricool
        </a>
      </div>

      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Posts prêts à exporter · {readyPosts.length}</div>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {readyPosts.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>
              Aucun post « prêt ». Marque des posts comme prêts depuis la page Posts.
            </div>
          ) : (
            readyPosts.map((p, idx) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  gap: 14,
                  padding: '12px 20px',
                  alignItems: 'center',
                  borderBottom: idx < readyPosts.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--text-3)',
                    width: 120,
                  }}
                >
                  {p.scheduledDate ?? 'non planifié'} {p.scheduledTime ?? ''}
                </span>
                <span className="badge badge-brand">
                  {PLATFORM_LABEL[p.platform] ?? p.platform}
                </span>
                {p.isCarousel && <span className="badge badge-ai">carrousel</span>}
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-2)' }}>
                  {(p.ideaTitle ?? p.text).slice(0, 90)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Notes de contexte · {notes.length}</div>
          <AddNoteForm />
        </div>
        <div
          className="view-card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          {notes.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
              Aucune note. Ajoute le concept CO Opération, ta vision, les angles à pousser, les
              chiffres clés SAH… tout ce qui doit guider l'IA.
            </div>
          ) : (
            notes.map((n) => (
              <NoteEditor key={n.id} id={n.id} initialTitle={n.title} initialContent={n.content} />
            ))
          )}
        </div>
      </div>
    </>
  );
}
