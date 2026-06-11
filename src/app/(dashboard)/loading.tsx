/**
 * Skeleton global du dashboard : affiché instantanément pendant le rendu
 * serveur de chaque page (toutes sont force-dynamic). Perception de vitesse
 * immédiate au lieu d'un écran figé.
 */
export default function DashboardLoading() {
  return (
    <>
      <div>
        <div className="skeleton" style={{ width: 220, height: 26, borderRadius: 8 }} />
        <div
          className="skeleton"
          style={{ width: 320, height: 13, borderRadius: 6, marginTop: 10, maxWidth: '100%' }}
        />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
          gap: 12,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 108, borderRadius: 20 }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 240, borderRadius: 20 }} />
      <div className="skeleton" style={{ height: 160, borderRadius: 20 }} />
    </>
  );
}
