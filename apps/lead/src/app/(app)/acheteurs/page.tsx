import { Plus } from 'lucide-react';
import Link from 'next/link';
import { LinkButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { getAuthenticatedUser } from '@/lib/auth';
import { listBuyers } from '@/lib/buyers/queries';

export const dynamic = 'force-dynamic';

export default async function BuyersPage() {
  const user = await getAuthenticatedUser();
  const items = await listBuyers(user);
  const isAdmin = user.role === 'admin';
  return (
    <>
      <PageHeader
        title="Acheteurs"
        count={items.length}
        sub="Partenaires ORIAS qui reçoivent les rendez-vous."
        actions={
          isAdmin ? (
            <LinkButton href="/acheteurs/nouveau" variant="primary">
              <Plus /> Nouvel acheteur
            </LinkButton>
          ) : null
        }
      />
      {items.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Acheteur</th>
                <th>Source</th>
                <th>ORIAS</th>
                <th>Priorité</th>
                <th>Prix / RDV</th>
                <th>Pack</th>
                <th>RDV posés</th>
                <th>Facturables</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {items.map(
                ({ buyer: b, sourceName, packRemaining, packIsPilot, rdvPosed, rdvBillable }) => (
                  <tr key={b.id}>
                    <td className="primary">
                      {isAdmin ? (
                        <Link href={`/acheteurs/${b.id}`} className="row-link">
                          {b.name}
                        </Link>
                      ) : (
                        b.name
                      )}
                      <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
                        {b.contactEmail}
                      </span>
                    </td>
                    <td className="muted">{sourceName}</td>
                    <td className="muted num">{b.oriasNumber}</td>
                    <td className="num">{b.priority}</td>
                    <td className="num">{(b.pricePerRdvCents / 100).toLocaleString('fr-FR')} €</td>
                    <td className="num">
                      {packRemaining === null
                        ? '—'
                        : `${packRemaining} restant(s)${packIsPilot ? ' · pilote' : ''}`}
                    </td>
                    <td className="num">{rdvPosed}</td>
                    <td className="num">{rdvBillable}</td>
                    <td>
                      {!b.active ? (
                        <Pill>Inactif</Pill>
                      ) : b.pausedUntil && b.pausedUntil > new Date() ? (
                        <Pill tone="warning">En pause</Pill>
                      ) : (
                        <Pill tone="success">Actif</Pill>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <EmptyState title="Aucun acheteur">
            {isAdmin
              ? 'Créez le premier acheteur pour pouvoir poser des rendez-vous.'
              : 'L’admin n’a pas encore créé d’acheteur.'}
          </EmptyState>
        </div>
      )}
    </>
  );
}
