import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import {
  type BrevoContact,
  getBrevoContactByEmail,
  getBrevoContacts,
  getBrevoLists,
} from '@/lib/integrations/brevo/client';
import { ContactsToolbar } from './contacts-toolbar';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

function nb(n: number): string {
  return n.toLocaleString('fr-FR');
}

function displayName(c: BrevoContact): string {
  const a = c.attributes;
  const first = (a.PRENOM ?? a.FIRSTNAME ?? a.firstname ?? '') as string;
  const last = (a.NOM ?? a.LASTNAME ?? a.lastname ?? '') as string;
  return `${first} ${last}`.trim() || '—';
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; offset?: string }>;
}) {
  const { q, offset: offsetParam } = await searchParams;
  const query = q?.trim() ?? '';
  const offset = Math.max(0, Number.parseInt(offsetParam ?? '0', 10) || 0);

  let contacts: BrevoContact[] = [];
  let total = 0;
  let lists: Awaited<ReturnType<typeof getBrevoLists>> = [];
  let error: string | null = null;

  try {
    lists = await getBrevoLists();
    if (query) {
      const found = await getBrevoContactByEmail(query);
      contacts = found ? [found] : [];
      total = contacts.length;
    } else {
      const res = await getBrevoContacts(offset, PAGE_SIZE);
      contacts = res.contacts;
      total = res.total;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Erreur inconnue';
  }

  const listName = new Map(lists.map((l) => [l.id, l.name]));

  return (
    <>
      <Link
        href="/email"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--text-3)',
          marginBottom: 4,
        }}
      >
        <ArrowLeft size={14} />
        Retour à Email
      </Link>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
        }}
      >
        <div>
          <h1 className="page-title">Contacts</h1>
          <div className="page-desc">
            {query ? `Recherche : ${query}` : `${nb(total)} contacts dans Brevo`}
          </div>
        </div>
      </div>

      <ContactsToolbar
        lists={lists.map((l) => ({ id: l.id, name: l.name }))}
        initialQuery={query}
      />

      {error ? (
        <div className="alert alert-danger">
          <span className="alert-icon">
            <AlertTriangle size={16} />
          </span>
          <div className="alert-body">
            <div className="alert-title">Impossible de charger les contacts</div>
            <div className="alert-description">{error}.</div>
          </div>
        </div>
      ) : (
        <div className="view-card">
          <div className="view-card-body" style={{ padding: 0 }}>
            <div
              className="r-stack r-head"
              style={{
                display: 'grid',
                gridTemplateColumns: '1.6fr 1.2fr 1fr 90px',
                gap: 12,
                padding: '10px 20px',
                borderBottom: '1px solid var(--border)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-4)',
              }}
            >
              <span>Email</span>
              <span>Nom</span>
              <span>Listes</span>
              <span style={{ textAlign: 'right' }}>Statut</span>
            </div>

            {contacts.length === 0 ? (
              <div style={{ padding: '24px 20px', fontSize: 13, color: 'var(--text-3)' }}>
                {query ? 'Aucun contact pour cet email.' : 'Aucun contact.'}
              </div>
            ) : (
              contacts.map((c, idx) => (
                <div
                  key={c.id}
                  className="r-stack"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.6fr 1.2fr 1fr 90px',
                    gap: 12,
                    alignItems: 'center',
                    padding: '12px 20px',
                    borderBottom: idx < contacts.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: 'var(--text-1)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.email}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{displayName(c)}</span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-3)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.listIds.length === 0
                      ? '—'
                      : c.listIds
                          .map((id) => listName.get(id) ?? `#${id}`)
                          .slice(0, 2)
                          .join(', ') + (c.listIds.length > 2 ? `  +${c.listIds.length - 2}` : '')}
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    {c.emailBlacklisted ? (
                      <span className="badge badge-danger">Désinscrit</span>
                    ) : (
                      <span className="badge badge-success badge-dot">Actif</span>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Pagination (désactivée en mode recherche) */}
      {!query && !error && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {offset + 1}–{offset + contacts.length} sur {nb(total)}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {offset > 0 && (
              <Link
                href={`/email/contacts?offset=${Math.max(0, offset - PAGE_SIZE)}`}
                className="btn btn-secondary btn-sm"
              >
                Précédent
              </Link>
            )}
            {offset + PAGE_SIZE < total && (
              <Link
                href={`/email/contacts?offset=${offset + PAGE_SIZE}`}
                className="btn btn-secondary btn-sm"
              >
                Suivant
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
