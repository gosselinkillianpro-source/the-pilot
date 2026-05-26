export default function PipelinePage() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: '1.875rem',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            color: 'var(--text-1)',
            marginBottom: 4,
          }}
        >
          Pipeline closing
        </h1>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-3)' }}>
          Module Closing Engine — placeholder en attendant les vraies données SAH.
        </p>
      </div>

      <div className="liquid" style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-2)', fontSize: '0.875rem' }}>
          Kanban des investisseurs à venir ici. Données mockées en attendant le branchement à l'API
          SAH (cf. <code>docs/appel-sah-questions.md</code>).
        </p>
      </div>
    </div>
  );
}
