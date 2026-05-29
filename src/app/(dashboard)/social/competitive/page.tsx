import { desc, eq } from 'drizzle-orm';
import { SAH_COMPETITORS } from '@/lib/ai/prompts/sah-brand';
import { db } from '@/lib/db';
import { socialCompetitorReports } from '@/lib/db/schema';
import { ReportActions, RunWatchButton } from './competitive-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Report = {
  id: string;
  competitor: string;
  report: Record<string, unknown>;
  createdAt: Date;
};

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export default async function CompetitivePage() {
  // Dernier rapport par concurrent
  const latest: Report[] = [];
  for (const competitor of SAH_COMPETITORS) {
    const rows = await db
      .select()
      .from(socialCompetitorReports)
      .where(eq(socialCompetitorReports.competitor, competitor))
      .orderBy(desc(socialCompetitorReports.createdAt))
      .limit(1);
    if (rows[0]) {
      latest.push({
        id: rows[0].id,
        competitor: rows[0].competitor,
        report: (rows[0].report ?? {}) as Record<string, unknown>,
        createdAt: rows[0].createdAt,
      });
    }
  }

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
          <h1 className="page-title">Veille concurrents</h1>
          <div className="page-desc">
            Grok analyse {SAH_COMPETITORS.length} concurrents (LinkedIn, Insta, presse) : angles qui
            marchent, opportunités SAH, à éviter. Convertis un rapport en idées en un clic.
          </div>
        </div>
        <RunWatchButton />
      </div>

      {latest.length === 0 ? (
        <div className="view-card">
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
            Aucune analyse pour l'instant. Concurrents suivis : {SAH_COMPETITORS.join(', ')}.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
            gap: 16,
          }}
        >
          {latest.map((r) => {
            const summary = typeof r.report.summary === 'string' ? r.report.summary : '';
            const angles = asStringArray(r.report.top_angles);
            const opps = asStringArray(r.report.opportunities_for_sah);
            return (
              <div key={r.id} className="view-card">
                <div
                  className="view-card-body"
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>
                      {r.competitor}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {r.createdAt.toISOString().slice(0, 10)}
                    </span>
                  </div>
                  {summary && (
                    <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                      {summary}
                    </div>
                  )}
                  {angles.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {angles.slice(0, 3).map((a) => (
                        <span key={a} className="badge badge-neutral">
                          {a.slice(0, 50)}
                        </span>
                      ))}
                    </div>
                  )}
                  {opps.length > 0 && (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-2)',
                        background: 'var(--ai-bg)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        borderLeft: '3px solid var(--ai)',
                      }}
                    >
                      💡 {opps[0]}
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <ReportActions reportId={r.id} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
