import Link from 'next/link';
import { StageMover } from '@/components/closing/stage-mover';
import { type BoardColumn, getPipelineBoard } from '@/lib/db/queries/closing';

export const dynamic = 'force-dynamic';

export default async function BoardPage() {
  const columns = await getPipelineBoard();

  return (
    <>
      <div>
        <h1 className="page-title">Pipeline</h1>
        <div className="page-desc">
          Tes leads par étape. Change l'étape d'un lead directement depuis sa carte.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
        {columns.map((col) => (
          <Column key={col.stage} col={col} />
        ))}
      </div>
    </>
  );
}

function Column({ col }: { col: BoardColumn }) {
  return (
    <div
      style={{
        flex: '0 0 240px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        background: 'var(--glass-bg)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 10,
        maxHeight: '70vh',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{col.label}</span>
        <span className="badge badge-neutral">{col.total}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        {col.cards.length === 0 ? (
          <span style={{ fontSize: 11, color: 'var(--text-4)', padding: '4px 2px' }}>—</span>
        ) : (
          col.cards.map((c) => (
            <div
              key={c.id}
              style={{
                background: 'var(--glass-bg-strong)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <Link
                href={`/closing/investor/${c.id}`}
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}
              >
                {c.fullName ?? '—'}
              </Link>
              {c.city ? (
                <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{c.city}</span>
              ) : null}
              <StageMover investorId={c.id} current={col.stage} />
            </div>
          ))
        )}
        {col.total > col.cards.length && (
          <span style={{ fontSize: 10, color: 'var(--text-4)' }}>
            + {col.total - col.cards.length} autres
          </span>
        )}
      </div>
    </div>
  );
}
