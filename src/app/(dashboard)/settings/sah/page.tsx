import { AlertTriangle, Database } from 'lucide-react';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import {
  getProfilCompletDiagnostic,
  getSahBreachSubDiag,
  getSahDiagnostics,
  getSahSchema,
  type ProfilCompletDiagnostic,
  type SahBreachSubDiag,
  type SahColumn,
  type SahDiagnostics,
} from '@/lib/integrations/sah/client';
import { SyncButton } from './sync-button';

function money(n: number): string {
  return `${n.toLocaleString('fr-FR')} €`;
}

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
  let profilDiag: ProfilCompletDiagnostic | null = null;
  let subDiag: SahBreachSubDiag | null = null;
  let error: string | null = null;
  try {
    [schema, diag, profilDiag, subDiag] = await Promise.all([
      getSahSchema(),
      getSahDiagnostics(),
      getProfilCompletDiagnostic(),
      getSahBreachSubDiag(),
    ]);
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

          <div className="view-card">
            <div className="view-card-header">
              <div className="view-card-title">Synchronisation (investisseurs + projets)</div>
            </div>
            <div
              className="view-card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
                Copie les champs non sensibles de SAH (users, projects) dans THE PILOT. Lecture
                seule côté SAH. Les souscriptions et dates de remboursement viendront ensuite.
              </p>
              <SyncButton />
            </div>
          </div>

          {subDiag && (
            <div className="view-card">
              <div className="view-card-header">
                <div className="view-card-title">
                  Collecte BREACH — souscriptions par wallet_status
                </div>
                <span className="badge badge-brand">cible : 156 / 63 788 €</span>
              </div>
              <div
                className="view-card-body"
                style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}
              >
                {subDiag.byWalletStatus.map((r) => (
                  <div key={r.value} style={{ color: 'var(--text-2)' }}>
                    « {r.value} » : <strong>{r.count}</strong> souscriptions → {money(r.total)}
                  </div>
                ))}
                <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <div style={{ color: 'var(--text-1)' }}>
                    wallet_status = « completed » : <strong>{subDiag.completed.count}</strong> →{' '}
                    <strong>{money(subDiag.completed.total)}</strong>
                  </div>
                  <div style={{ color: 'var(--text-3)' }}>
                    réservations (reservation=true) : {subDiag.reservationsTrue.count} →{' '}
                    {money(subDiag.reservationsTrue.total)}
                  </div>
                  <div style={{ color: 'var(--text-3)' }}>
                    hors annulées (canceled_at null) : {subDiag.nonCancelled.count} →{' '}
                    {money(subDiag.nonCancelled.total)}
                  </div>
                </div>
              </div>
            </div>
          )}

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
                <div>
                  <strong style={{ fontSize: 13 }}>lw_onboarding_status (KYC Lemonway ?)</strong>
                  {diag.onboardingStatuses.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>—</div>
                  ) : (
                    diag.onboardingStatuses.map((s) => (
                      <div key={s.value} style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        « {s.value} » : <strong>{s.count}</strong>
                      </div>
                    ))
                  )}
                </div>
                <div>
                  <strong style={{ fontSize: 13 }}>wallet_status (portefeuille)</strong>
                  {diag.walletStatuses.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>—</div>
                  ) : (
                    diag.walletStatuses.map((s) => (
                      <div key={s.value} style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        « {s.value} » : <strong>{s.count}</strong>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {profilDiag && (
            <div className="view-card">
              <div className="view-card-header">
                <div className="view-card-title">Recherche de la colonne « Profil complet »</div>
                <span className="badge badge-brand">non sensible</span>
              </div>
              <div
                className="view-card-body"
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>
                  Cible (fichier exporté le 04/06) :{' '}
                  <strong>{profilDiag.targets.profilesComplete}</strong> profils complets ·{' '}
                  <strong>{profilDiag.targets.personsComplete}</strong> personnes ·{' '}
                  <strong>{profilDiag.targets.personsOnboarded}</strong> onboardées. Base SAH :{' '}
                  <strong>{profilDiag.totalProfiles}</strong> profils ·{' '}
                  <strong>{profilDiag.totalPersons}</strong> personnes. La bonne colonne est celle
                  dont le nombre de profils colle à la cible.
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 90px 110px 110px',
                    gap: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-3)',
                    padding: '0 4px',
                  }}
                >
                  <span>colonne</span>
                  <span>type</span>
                  <span style={{ textAlign: 'right' }}>profils</span>
                  <span style={{ textAlign: 'right' }}>personnes</span>
                </div>
                {profilDiag.candidates.map((c) => {
                  const match =
                    Math.abs(c.trueProfiles - profilDiag.targets.profilesComplete) <= 30;
                  return (
                    <div
                      key={c.column}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 90px 110px 110px',
                        gap: 8,
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                        padding: '4px',
                        borderRadius: 6,
                        background: match ? 'var(--success-bg, #e6f6ec)' : 'transparent',
                      }}
                    >
                      <span style={{ color: 'var(--text-1)' }}>
                        {match ? '✅ ' : ''}
                        {c.column}
                      </span>
                      <span style={{ color: 'var(--text-3)' }}>{c.type}</span>
                      <span style={{ textAlign: 'right', color: 'var(--text-1)' }}>
                        {c.trueProfiles}
                      </span>
                      <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>
                        {c.truePersons}
                      </span>
                    </div>
                  );
                })}

                <hr
                  style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }}
                />

                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>
                  <strong>Échelle des valeurs de `status`</strong> (la plus probable pour « profil
                  complet »). La colonne <em>cumul</em> = nb de personnes couvertes en ajoutant les
                  valeurs une à une. On cherche l'étage où <em>cumul</em> ={' '}
                  <strong>{profilDiag.targets.personsComplete}</strong>.
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 90px 110px 120px',
                    gap: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-3)',
                    padding: '0 4px',
                  }}
                >
                  <span>status</span>
                  <span style={{ textAlign: 'right' }}>profils</span>
                  <span style={{ textAlign: 'right' }}>personnes</span>
                  <span style={{ textAlign: 'right' }}>cumul (pers.)</span>
                </div>
                {profilDiag.statusLadder.map((s) => {
                  const match =
                    Math.abs(s.cumulativePersons - profilDiag.targets.personsComplete) <= 20;
                  return (
                    <div
                      key={s.value}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 90px 110px 120px',
                        gap: 8,
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                        padding: '4px',
                        borderRadius: 6,
                        background: match ? 'var(--success-bg, #e6f6ec)' : 'transparent',
                      }}
                    >
                      <span style={{ color: 'var(--text-1)' }}>
                        {match ? '✅ ' : ''}
                        {s.value}
                      </span>
                      <span style={{ textAlign: 'right', color: 'var(--text-3)' }}>
                        {s.profiles}
                      </span>
                      <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>
                        {s.persons}
                      </span>
                      <span style={{ textAlign: 'right', color: 'var(--text-1)', fontWeight: 600 }}>
                        {s.cumulativePersons}
                      </span>
                    </div>
                  );
                })}

                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>
                  Contrôles (grain personne) : <code>status='validate'</code> ={' '}
                  <strong>{profilDiag.sanity.validatePersons}</strong> (notre mapping actuel, cible
                  ~1779) · onboardés = <strong>{profilDiag.sanity.onboardedPersons}</strong> (cible
                  1795).
                </p>
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
