import { AlertTriangle, Database } from 'lucide-react';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import {
  getSahDiagnostics,
  getSahSchema,
  type SahColumn,
  type SahDiagnostics,
} from '@/lib/integrations/sah/client';

export const dynamic = 'force-dynamic';

export default async function SahExplorerPage() {
  // Réservé admin (defense en profondeur).
  try {
    const user = await getAuthenticatedUser();
    await requireRole(user, ['admin']);
  } catch {
    return (
      <div className="alert alert-danger">
        <span className="alert-icon">
          <AlertTriangle size={16} />
        </span>
        <div className="alert-body">
          <div className="alert-title">Accès réservé</div>
          <div className="alert-description">Cette page est réservée aux administrateurs.</div>
        </div>
      </div>
    );
  }

  let schema: SahColumn[] = [];
  let diag: SahDiagnostics | null = null;
  let error: string | null = null;
  try {
    [schema, diag] = await Promise.all([getSahSchema(), getSahDiagnostics()]);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Erreur inconnue';
  }

  // Regroupe les colonnes par table.
  const byTable = new Map<string, SahColumn[]>();
  for (const c of schema) {
    const list = byTable.get(c.table) ?? [];
    list.push(c);
    byTable.set(c.table, list);
  }

  return (
    <>
      <div>
        <h1 className="page-title">Explorateur base SAH</h1>
        <div className="page-desc">
          Structure (lecture seule) de la réplique Seven At Home. Aucune donnée investisseur n'est
          affichée — uniquement les noms de tables et colonnes.
        </div>
      </div>

      {error ? (
        <div className="alert alert-danger">
          <span className="alert-icon">
            <AlertTriangle size={16} />
          </span>
          <div className="alert-body">
            <div className="alert-title">Connexion à la base SAH impossible</div>
            <div className="alert-description">
              {error}
              <br />
              Causes fréquentes : IP Render non encore whitelistée par SAH, `SAH_DATABASE_URL`
              absente/incorrecte, ou SSL requis différemment.
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="alert alert-info">
            <span className="alert-icon">
              <Database size={16} />
            </span>
            <div className="alert-body">
              <div className="alert-title">
                {byTable.size} tables · {schema.length} colonnes
              </div>
              <div className="alert-description">
                Connexion réussie. Transmets le diagnostic ci-dessous à Claude pour construire la
                synchronisation.
              </div>
            </div>
          </div>

          {diag && (
            <div className="view-card">
              <div className="view-card-header">
                <div className="view-card-title">Diagnostic (à copier à Claude)</div>
                <span className="badge badge-brand">non sensible</span>
              </div>
              <div
                className="view-card-body"
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                <div>
                  <strong style={{ fontSize: 13 }}>Volumes</strong>
                  {diag.counts.map((c) => (
                    <div key={c.table} style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      {c.table} : <strong>{c.rows < 0 ? 'non lisible' : c.rows}</strong>
                    </div>
                  ))}
                </div>
                <div>
                  <strong style={{ fontSize: 13 }}>
                    KYC validé (onboarding) : {diag.kycValidatedCount}
                  </strong>
                </div>
                <div>
                  <strong style={{ fontSize: 13 }}>Valeurs de users_profiles.status</strong>
                  {diag.profileStatuses.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>—</div>
                  ) : (
                    diag.profileStatuses.map((s) => (
                      <div key={s.value} style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        « {s.value} » : <strong>{s.count}</strong>
                      </div>
                    ))
                  )}
                </div>
                <div>
                  <strong style={{ fontSize: 13 }}>États du questionnaire (suitability)</strong>
                  {diag.suitabilityStates.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>—</div>
                  ) : (
                    diag.suitabilityStates.map((s) => (
                      <div key={s.value} style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        « {s.value} » : <strong>{s.count}</strong>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {[...byTable.entries()].map(([table, cols]) => (
            <div key={table} className="view-card">
              <div className="view-card-header">
                <div className="view-card-title" style={{ fontFamily: 'var(--font-mono)' }}>
                  {table}
                </div>
                <span className="badge badge-neutral">{cols.length} colonnes</span>
              </div>
              <div className="view-card-body" style={{ padding: 0 }}>
                {cols.map((c) => (
                  <div
                    key={c.column}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 180px 70px',
                      gap: 12,
                      padding: '8px 20px',
                      borderTop: '1px solid var(--border)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: 'var(--text-1)' }}>{c.column}</span>
                    <span style={{ color: 'var(--text-3)' }}>{c.type}</span>
                    <span style={{ color: 'var(--text-4)', textAlign: 'right' }}>
                      {c.nullable ? 'null' : 'not null'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
