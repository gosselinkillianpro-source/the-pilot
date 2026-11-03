import { AlertTriangle, ChevronRight, Search } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  type ClubDealRow,
  DISPOS,
  DOSSIERS,
  label,
  MONTANTS,
  STATUTS,
} from '@/lib/club-deal/constants';
import { NO_ACCOUNT, type PlatformStatus } from '@/lib/db/queries/club-deal-platform';
import { StatusControl } from './status-control';
import { fmtDate, PhoneWithConsent, PlatformBadge, StatusBadge, statusOf } from './ui';

/**
 * Liste des manifestations d'intérêt : tableau complet sur grand écran,
 * cartes empilées sur mobile (même données, lecture verticale).
 */

type Props = {
  rows: ClubDealRow[];
  platform: Map<string, PlatformStatus>;
  canEdit: boolean;
};

const SHORT_DOSSIER: Record<string, string> = {
  jonage: 'Jonage',
  srl: 'St-Romain',
  npl: 'NPL Espagne',
};

function DossierTags({ codes }: { codes: string[] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {codes.map((c) => (
        <span key={c} className="badge badge-neutral" title={label(DOSSIERS, c)}>
          {SHORT_DOSSIER[c] ?? c}
        </span>
      ))}
    </span>
  );
}

function DuplicateFlag({ of }: { of: string | null }) {
  if (!of) return <span style={{ color: 'var(--text-4)' }}>—</span>;
  return (
    <span className="badge badge-warning" title={`Même e-mail que ${of} (moins de 30 jours)`}>
      <AlertTriangle size={11} />
      {of}
    </span>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th
      scope="col"
      style={{
        textAlign: 'left',
        fontSize: 10.5,
        fontWeight: 600,
        color: 'var(--text-3)',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        padding: '8px 10px',
        borderBottom: '1px solid var(--border)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, wrap = false }: { children: ReactNode; wrap?: boolean }) {
  return (
    <td
      style={{
        fontSize: 13,
        color: 'var(--text-1)',
        padding: '10px',
        borderBottom: '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
        whiteSpace: wrap ? 'normal' : 'nowrap',
        verticalAlign: 'top',
      }}
    >
      {children}
    </td>
  );
}

function Truncated({ text, width }: { text: string; width: number }) {
  if (!text) return <span style={{ color: 'var(--text-4)' }}>—</span>;
  return (
    <span
      title={text}
      style={{
        display: 'block',
        maxWidth: width,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: 'var(--text-2)',
      }}
    >
      {text}
    </span>
  );
}

function DesktopTable({ rows, platform, canEdit }: Props) {
  return (
    <div className="table-scroll max-[900px]:hidden">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <Th>Référence</Th>
            <Th>Date</Th>
            <Th>Nom</Th>
            <Th>Statut</Th>
            <Th>Plateforme</Th>
            <Th>Dossiers</Th>
            <Th>Montant</Th>
            <Th>Téléphone</Th>
            <Th>Disponibilité</Th>
            <Th>Profil</Th>
            <Th>Message</Th>
            <Th>Doublon</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ref}>
              <Td>
                <Link
                  href={`/club-deal/${r.id}`}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--brand-text)',
                  }}
                >
                  {r.ref}
                </Link>
              </Td>
              <Td>{fmtDate(r.created_at, true)}</Td>
              <Td>
                <Link
                  href={`/club-deal/${r.id}`}
                  style={{ fontWeight: 600, color: 'var(--text-1)' }}
                >
                  {r.prenom} {r.nom}
                </Link>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.email}</div>
              </Td>
              <Td>
                {canEdit ? (
                  <StatusControl
                    id={Number(r.id)}
                    initial={statusOf(r.processing_status)}
                    compact
                  />
                ) : (
                  <StatusBadge code={r.processing_status} />
                )}
              </Td>
              <Td>
                <PlatformBadge status={platform.get(r.email) ?? NO_ACCOUNT} />
              </Td>
              <Td>
                <DossierTags codes={r.dossiers} />
              </Td>
              <Td>{label(MONTANTS, r.montant)}</Td>
              <Td>
                <PhoneWithConsent phone={r.telephone} consent={r.consent_tel} />
              </Td>
              <Td>{label(DISPOS, r.disponibilite)}</Td>
              <Td>{label(STATUTS, r.statut)}</Td>
              <Td>
                <Truncated text={r.message} width={200} />
              </Td>
              <Td>
                <DuplicateFlag of={r.duplicate_of} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileCards({ rows, platform }: Omit<Props, 'canEdit'>) {
  return (
    <ul
      // Pas de `display` en ligne : il écraserait `hidden` au-dessus de 900 px.
      className="flex flex-col gap-2 min-[901px]:hidden"
      style={{ listStyle: 'none', margin: 0, padding: 0 }}
    >
      {rows.map((r) => (
        <li key={r.ref}>
          <Link
            href={`/club-deal/${r.id}`}
            className="view-card"
            style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
          >
            <div
              className="view-card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14 }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)' }}>
                    {r.prenom} {r.nom}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', overflowWrap: 'anywhere' }}>
                    {r.email}
                  </div>
                </div>
                <StatusBadge code={r.processing_status} />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <DossierTags codes={r.dossiers} />
                <PlatformBadge status={platform.get(r.email) ?? NO_ACCOUNT} />
                {r.duplicate_of && <DuplicateFlag of={r.duplicate_of} />}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {label(MONTANTS, r.montant)} · {label(DISPOS, r.disponibilite)}
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 11,
                  color: 'var(--text-4)',
                }}
              >
                <span>
                  {r.ref} · {fmtDate(r.created_at, true)}
                </span>
                <ChevronRight size={14} />
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function SearchForm({ q, status }: { q: string; status: string | null }) {
  return (
    <form
      action="/club-deal"
      method="get"
      style={{ position: 'relative', flex: '1 1 260px', maxWidth: 420 }}
    >
      {status && <input type="hidden" name="status" value={status} />}
      <Search
        size={14}
        aria-hidden
        style={{
          position: 'absolute',
          left: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-4)',
        }}
      />
      <input
        className="input"
        type="search"
        name="q"
        defaultValue={q}
        aria-label="Rechercher par nom, e-mail ou référence"
        placeholder="Nom, e-mail ou référence (CD-…)"
        style={{ paddingLeft: 30, width: '100%' }}
      />
    </form>
  );
}

export function InterestList(props: Props) {
  if (!props.rows.length) {
    return (
      <div className="view-card">
        <div
          className="view-card-body"
          style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: 28 }}
        >
          Aucune demande ne correspond à ces critères.
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="view-card max-[900px]:hidden">
        <DesktopTable {...props} />
      </div>
      <MobileCards rows={props.rows} platform={props.platform} />
    </>
  );
}
