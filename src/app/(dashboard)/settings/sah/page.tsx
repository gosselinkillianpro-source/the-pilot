import { AlertTriangle, Database, Network } from 'lucide-react';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import {
  getProfilCompletDiagnostic,
  getRegFieldDiagnostic,
  getSahBreachSubDiag,
  getSahBreachTreeDiag,
  getSahDiagnostics,
  getSahReferralDeepDiag,
  getSahReferralDiag,
  getSahSchema,
  type ProfilCompletDiagnostic,
  type RegFieldDiagnostic,
  type SahBreachSubDiag,
  type SahBreachTreeDiag,
  type SahColumn,
  type SahDiagnostics,
  type SahReferralDeepDiag,
  type SahReferralDiag,
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
  let regDiag: RegFieldDiagnostic | null = null;
  let referralDiag: SahReferralDiag | null = null;
  let treeDiag: SahBreachTreeDiag | null = null;
  let deepDiag: SahReferralDeepDiag | null = null;
  let error: string | null = null;
  try {
    [schema, diag, profilDiag, subDiag, regDiag, referralDiag, treeDiag, deepDiag] =
      await Promise.all([
        getSahSchema(),
        getSahDiagnostics(),
        getProfilCompletDiagnostic(),
        getSahBreachSubDiag(),
        getRegFieldDiagnostic(),
        getSahReferralDiag(),
        getSahBreachTreeDiag(),
        getSahReferralDeepDiag(),
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

          {referralDiag && (
            <div className="view-card">
              <div className="view-card-header">
                <div
                  className="view-card-title"
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <Network size={15} />
                  Parrainage BREACH multi-niveaux — faisabilité
                </div>
                <span
                  className={`badge ${
                    referralDiag.verdict === 'likely'
                      ? 'badge-success'
                      : referralDiag.verdict === 'unlikely'
                        ? 'badge-warning'
                        : 'badge-neutral'
                  }`}
                >
                  {referralDiag.verdict === 'likely'
                    ? 'arbre reconstructible'
                    : referralDiag.verdict === 'unlikely'
                      ? 'lien propriétaire absent'
                      : 'indéterminé'}
                </span>
              </div>
              <div
                className="view-card-body"
                style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}
              >
                <p style={{ margin: 0, color: 'var(--text-2)' }}>
                  {referralDiag.verdict === 'likely'
                    ? 'Bonne nouvelle : SAH semble relier chaque code à un propriétaire — on peut remonter l’arbre (BREACH → N-1 → N-2…).'
                    : referralDiag.verdict === 'unlikely'
                      ? 'La table des codes ne semble PAS relier un code à la personne qui le possède. Il faudra demander à SAH d’ajouter ce lien pour reconstruire l’arbre.'
                      : 'Impossible de lire la structure (connexion SAH ?).'}
                </p>
                <div style={{ color: 'var(--text-3)' }}>
                  <strong>Colonnes « propriétaire » détectées</strong> :{' '}
                  {referralDiag.ownerCandidates.length > 0
                    ? referralDiag.ownerCandidates.join(', ')
                    : 'aucune'}
                </div>
                <div style={{ color: 'var(--text-3)' }}>
                  <strong>Tables liées au parrainage</strong> :{' '}
                  {referralDiag.referralTables.length > 0
                    ? referralDiag.referralTables.join(', ')
                    : 'aucune'}
                </div>
                <div style={{ color: 'var(--text-3)' }}>
                  <strong>Colonnes parrainage dans `users`</strong> :{' '}
                  {referralDiag.userReferralColumns.length > 0
                    ? referralDiag.userReferralColumns.join(', ')
                    : 'aucune'}
                </div>
                <div style={{ color: 'var(--text-3)' }}>
                  Codes bonus : <strong>{referralDiag.totalBonusCodes}</strong> au total ·{' '}
                  <strong>{referralDiag.breachBonusCodes}</strong> contenant « breach ».
                </div>
                <div style={{ marginTop: 4 }}>
                  <strong style={{ fontSize: 12 }}>Colonnes de `bonus_codes`</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {referralDiag.bonusCodeColumns.length === 0 ? (
                      <span style={{ fontSize: 12, color: 'var(--text-4)' }}>— non lisible —</span>
                    ) : (
                      referralDiag.bonusCodeColumns.map((c) => (
                        <span
                          key={c.column}
                          className="badge badge-neutral"
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
                        >
                          {c.column}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-4)' }}>
                  Copie ce bloc à Claude : il s'en sert pour construire l'attribution BREACH
                  multi-niveaux (tout cumulé) + le parrain sur chaque fiche.
                </p>
              </div>
            </div>
          )}

          {treeDiag && (
            <div className="view-card">
              <div className="view-card-header">
                <div
                  className="view-card-title"
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <Network size={15} />
                  Ton réseau BREACH réel (via l'arbre de parrainage)
                </div>
                <span className="badge badge-success">{treeDiag.totalNetworkParent} personnes</span>
              </div>
              <div
                className="view-card-body"
                style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}
              >
                <p style={{ margin: 0, color: 'var(--text-2)' }}>
                  Reconstitué via <code>invited_by_id</code> (qui a invité qui), à partir des{' '}
                  <strong>{treeDiag.directBreach}</strong> inscrits BREACH directs. Tout cumulé :{' '}
                  <strong>{treeDiag.totalNetworkParent}</strong> personnes ·{' '}
                  <strong>{money(treeDiag.totalCollecteParent)}</strong> de collecte.
                </p>
                <p style={{ margin: 0, color: 'var(--text-4)', fontSize: 12 }}>
                  (parent_id n'est presque jamais renseigné côté SAH — c'est invited_by_id qui porte
                  l'arbre de parrainage.)
                </p>
                <div
                  className="r-stack r-head"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 110px 140px',
                    gap: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-3)',
                    padding: '0 4px',
                  }}
                >
                  <span>niveau</span>
                  <span style={{ textAlign: 'right' }}>personnes</span>
                  <span style={{ textAlign: 'right' }}>collecte</span>
                </div>
                {treeDiag.byDepthParent.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    Aucun descendant trouvé — dis-le-moi, j'inspecte un autre lien.
                  </div>
                ) : (
                  treeDiag.byDepthParent.map((d) => (
                    <div
                      key={d.depth}
                      className="r-stack"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 110px 140px',
                        gap: 8,
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                        padding: '4px',
                      }}
                    >
                      <span style={{ color: 'var(--text-1)' }}>
                        {d.depth === 0 ? 'BREACH direct (N)' : `N-${d.depth}`}
                      </span>
                      <span style={{ textAlign: 'right', color: 'var(--text-1)' }}>{d.users}</span>
                      <span style={{ textAlign: 'right', color: 'var(--text-2)' }}>
                        {money(d.collecte)}
                      </span>
                    </div>
                  ))
                )}
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-4)' }}>
                  Contrôles : {treeDiag.usersWithParentId} personnes ont un parent ·{' '}
                  {treeDiag.usersWithInvitedBy} ont un « invité par » · types
                  «&nbsp;invited_by&nbsp;» :{' '}
                  {treeDiag.invitedByTypes.map((t) => `${t.value} (${t.count})`).join(', ') || '—'}.
                </p>
              </div>
            </div>
          )}

          {deepDiag && (
            <div className="view-card">
              <div className="view-card-header">
                <div
                  className="view-card-title"
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <Network size={15} />
                  Sous-parrainage — par quel chemin ?
                </div>
              </div>
              <div
                className="view-card-body"
                style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}
              >
                <div style={{ color: 'var(--text-2)' }}>
                  <strong>Invitations email</strong> : {deepDiag.n1DirectViaInvited} personne(s)
                  invitée(s) directement par un inscrit BREACH ({deepDiag.invitedByResolvable}{' '}
                  invitations « User » valides au total dans la base).
                </div>
                <div style={{ color: 'var(--text-2)' }}>
                  <strong>3 codes BREACH</strong> :{' '}
                  {deepDiag.breachCodes.length === 0
                    ? '—'
                    : deepDiag.breachCodes
                        .map(
                          (c) =>
                            `${c.code} (${c.usersCount ?? '?'} util.${c.ambassadorName ? `, ${c.ambassadorName}` : ''})`,
                        )
                        .join(' · ')}
                </div>
                <div style={{ color: 'var(--text-3)' }}>
                  <strong>Table `affiliate_programs`</strong> ({deepDiag.affiliateProgramsRows}{' '}
                  lignes) — colonnes :{' '}
                  {deepDiag.affiliateProgramsColumns.length > 0
                    ? deepDiag.affiliateProgramsColumns.join(', ')
                    : '—'}
                </div>
                <div style={{ color: 'var(--text-3)' }}>
                  <strong>Table `distributors_affiliated_profiles_exports`</strong> — colonnes :{' '}
                  {deepDiag.exportsColumns.length > 0 ? deepDiag.exportsColumns.join(', ') : '—'}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-4)' }}>
                  Copie ce bloc à Claude : il s'en sert pour savoir si le sous-parrainage passe par
                  les invitations email, par un code propre, ou par les programmes d'affiliation.
                </p>
              </div>
            </div>
          )}

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
                  Collecte BREACH — quelle définition = 156 / 63 788 € ?
                </div>
                <span className="badge badge-brand">cible : 156 / 63 788 €</span>
              </div>
              <div
                className="view-card-body"
                style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}
              >
                {(
                  [
                    ['Hors annulées (canceled_at null)', subDiag.nonCancelled],
                    ['Hors annulées ET hors paiement échoué', subDiag.nonCancelledNonFailed],
                    ['Réservées (reservation=true, non annulées)', subDiag.reserved],
                    [
                      'Validées (reservation=false, non échoué, non annulé)',
                      subDiag.validatedNonReserved,
                    ],
                    ['Paiements échoués (non annulés)', subDiag.failed],
                    ['Annulées', subDiag.cancelled],
                  ] as const
                ).map(([label, v]) => (
                  <div key={label} style={{ color: 'var(--text-2)' }}>
                    {label} : <strong>{v.count}</strong> → <strong>{money(v.total)}</strong>
                  </div>
                ))}
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

          {regDiag && (
            <div className="view-card">
              <div className="view-card-header">
                <div className="view-card-title">
                  « Profil complété » = champs perso renseignés (table users)
                </div>
                <span className="badge badge-brand">non sensible</span>
              </div>
              <div
                className="view-card-body"
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>
                  Cible (fichier) : <strong>{regDiag.targetPersons}</strong> personnes · base :{' '}
                  <strong>{regDiag.totalPersons}</strong>. La ligne ✅ (cumul de champs requis) est
                  la définition à retenir pour « profil complété ».
                </p>
                {regDiag.candidates.map((c) => {
                  const match = Math.abs(c.persons - regDiag.targetPersons) <= 30;
                  return (
                    <div
                      key={c.label}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                        padding: '4px 6px',
                        borderRadius: 6,
                        background: match ? 'var(--success-bg, #e6f6ec)' : 'transparent',
                      }}
                    >
                      <span style={{ color: 'var(--text-1)' }}>
                        {match ? '✅ ' : ''}
                        {c.label}
                      </span>
                      <strong>{c.persons}</strong>
                    </div>
                  );
                })}
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
                  className="r-stack r-head"
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
                      className="r-stack"
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
                  className="r-stack r-head"
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
                      className="r-stack"
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
                    className="r-stack"
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
