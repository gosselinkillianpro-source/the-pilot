import { AlertTriangle, ArrowLeft, ExternalLink, Mail, UserRound } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getAuthenticatedUser } from '@/lib/auth';
import { getClubDeal } from '@/lib/club-deal';
import { DISPOS, DOSSIERS, label, MONTANTS, STATUTS } from '@/lib/club-deal/constants';
import { getPlatformStatuses, NO_ACCOUNT } from '@/lib/db/queries/club-deal-platform';
import { NotesEditor } from '../notes-editor';
import { StatusControl } from '../status-control';
import { fmtDate, money, PhoneWithConsent, PlatformBadge, StatusBadge, statusOf } from '../ui';

export const dynamic = 'force-dynamic';

/** Lien cliquable seulement pour une URL http(s) (la page d'origine vient du formulaire public). */
function safeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
}

function Field({ label: name, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <dt
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          letterSpacing: 0.3,
        }}
      >
        {name}
      </dt>
      <dd style={{ margin: 0, fontSize: 14, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>
        {children}
      </dd>
    </div>
  );
}

function Card({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title">{title}</div>
        {aside}
      </div>
      <div className="view-card-body">{children}</div>
    </div>
  );
}

export default async function ClubDealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (user.role !== 'admin' && user.role !== 'executive') notFound();
  const canEdit = user.role === 'admin';

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const clubDeal = getClubDeal();
  const row = await clubDeal.getById(id);
  if (!row) notFound();
  const [history, platformMap] = await Promise.all([
    clubDeal.listByEmail(row.email),
    getPlatformStatuses([row.email]),
  ]);
  const platform = platformMap.get(row.email) ?? NO_ACCOUNT;
  const others = history.filter((h) => h.ref !== row.ref);
  const pageUrl = safeUrl(row.page_url);
  const utm = [row.utm_source, row.utm_medium, row.utm_campaign].filter(Boolean).join(' / ');

  return (
    <>
      <Link href="/club-deal" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft size={13} />
        Club deal
      </Link>

      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1
            className="page-title"
            style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
          >
            {row.prenom} {row.nom}
            <StatusBadge code={row.processing_status} />
          </h1>
          <div
            className="page-desc"
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
          >
            <span style={{ fontFamily: 'var(--font-mono)' }}>{row.ref}</span>
            <span>· reçu le {fmtDate(row.created_at, true)}</span>
            <span>· {label(STATUTS, row.statut)}</span>
          </div>
        </div>
        <a
          href={`mailto:${row.email}?subject=${encodeURIComponent(`Club deal · ${row.ref}`)}`}
          className="btn btn-secondary btn-sm"
        >
          <Mail size={13} />
          Écrire
        </a>
      </header>

      {row.duplicate_of && (
        <div
          className="alert alert-warning"
          style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}
        >
          <AlertTriangle size={15} />
          Doublon possible : même e-mail que la demande {row.duplicate_of} (moins de 30 jours).
        </div>
      )}

      <div className="split-2col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card title="Intention">
            <dl className="grid gap-4 grid-cols-1 sm:grid-cols-2" style={{ margin: 0 }}>
              <Field label="Projets">
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {row.dossiers.map((c) => (
                    <span key={c}>{label(DOSSIERS, c)}</span>
                  ))}
                </span>
              </Field>
              <Field label="Montant envisagé">{label(MONTANTS, row.montant)}</Field>
              <Field label="Disponibilité des fonds">{label(DISPOS, row.disponibilite)}</Field>
              <Field label="Profil déclaré">{label(STATUTS, row.statut)}</Field>
            </dl>
            <div style={{ marginTop: 16 }}>
              <Field label="Message">
                {row.message ? (
                  <span style={{ whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>
                    {row.message}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-4)' }}>Aucun message</span>
                )}
              </Field>
            </div>
          </Card>

          <Card title="Suivi">
            <StatusControl id={id} initial={statusOf(row.processing_status)} disabled={!canEdit} />
            {!canEdit && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
                Lecture seule (rôle executive).
              </div>
            )}
          </Card>

          <NotesEditor id={id} initialNotes={row.notes} readOnly={!canEdit} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card title="Contact">
            <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="E-mail">
                <a href={`mailto:${row.email}`} style={{ color: 'var(--brand-text)' }}>
                  {row.email}
                </a>
              </Field>
              <Field label="Téléphone">
                <PhoneWithConsent phone={row.telephone} consent={row.consent_tel} />
              </Field>
            </dl>
          </Card>

          <Card title="Sur la plateforme" aside={<PlatformBadge status={platform} />}>
            {platform.investorId ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  fontSize: 13,
                  color: 'var(--text-2)',
                }}
              >
                {platform.level === 'investi' && (
                  <span>
                    <strong style={{ color: 'var(--text-1)' }}>
                      {money(platform.totalInvested)}
                    </strong>{' '}
                    investis sur {platform.projectsCount} projet
                    {platform.projectsCount > 1 ? 's' : ''}
                  </span>
                )}
                <Link
                  href={`/closing/investor/${platform.investorId}`}
                  className="btn btn-secondary btn-sm"
                  style={{ alignSelf: 'flex-start' }}
                >
                  <UserRound size={13} />
                  Fiche investisseur
                </Link>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                Aucun compte Seven At Home avec cet e-mail (miroir mis à jour toutes les 15 min).
              </div>
            )}
          </Card>

          <Card title={`Historique${others.length ? ` · ${others.length + 1}` : ''}`}>
            {others.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                Première demande de cette personne.
              </div>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {others.map((h) => (
                  <li
                    key={h.ref}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      fontSize: 13,
                    }}
                  >
                    <Link
                      href={`/club-deal/${h.id}`}
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--brand-text)' }}
                    >
                      {h.ref}
                    </Link>
                    <span style={{ color: 'var(--text-3)' }}>{fmtDate(h.created_at)}</span>
                    <StatusBadge code={h.processing_status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Provenance">
            <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Campagne (UTM)">
                {utm || <span style={{ color: 'var(--text-4)' }}>—</span>}
              </Field>
              <Field label="Page">
                {pageUrl ? (
                  <a
                    href={pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--brand-text)',
                      display: 'inline-flex',
                      gap: 4,
                      alignItems: 'center',
                    }}
                  >
                    {new URL(pageUrl).pathname}
                    <ExternalLink size={12} />
                  </a>
                ) : (
                  <span style={{ color: 'var(--text-4)' }}>—</span>
                )}
              </Field>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
