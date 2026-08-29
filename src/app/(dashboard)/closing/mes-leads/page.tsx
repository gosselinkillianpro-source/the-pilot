import { KanbanSquare, PhoneOutgoing, Trophy, Users } from 'lucide-react';
import Link from 'next/link';
import { getAuthenticatedUser } from '@/lib/auth';
import { getClosers } from '@/lib/db/queries/closing';
import { listClosingCards } from '@/lib/db/queries/closing-pipeline';
import { PipelineBoard } from '../pipeline/pipeline-board';

export const dynamic = 'force-dynamic';

/**
 * « Mes leads » — le tableau PERSONNEL du closer.
 *
 * Dès qu'un closer enregistre son premier appel sur une personne libre, elle
 * lui est attitrée (propriété collante) : un seul interlocuteur jusqu'au bout.
 * Ce tableau, c'est SON portefeuille — mêmes colonnes et mêmes gestes que le
 * suivi général, filtré sur ses fiches à lui.
 *
 * L'admin (et la direction) peut ouvrir le tableau de n'importe quel closer
 * via le sélecteur — c'est la vue superviseur demandée par Killian.
 */
export default async function MyLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ closer?: string }>;
}) {
  const [sp, user] = await Promise.all([searchParams, getAuthenticatedUser()]);

  // Un closer ne voit que SON tableau ; admin et direction choisissent le closer.
  const canPick = user.role === 'admin' || user.role === 'executive';
  const closers = canPick ? await getClosers() : [];
  const pickable = closers.filter((c) => c.role !== 'admin');
  const requested = canPick && sp.closer ? pickable.find((c) => c.id === sp.closer) : undefined;
  const viewedId = requested?.id ?? (canPick ? (pickable[0]?.id ?? user.id) : user.id);
  const viewedName = requested?.name ?? pickable.find((c) => c.id === viewedId)?.name ?? null;
  const isMine = viewedId === user.id;

  const cards = await listClosingCards({ ownerId: viewedId, network: 'all' });

  const won = cards.filter((c) => c.stage === 'closed_won').length;
  const toCallBack = cards.filter((c) => c.stage === 'to_call_back').length;
  const collected = cards.reduce((sum, c) => sum + c.totalInvested, 0);

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 className="page-title">
            {isMine ? 'Mes leads' : `Leads de ${viewedName ?? 'ce closer'}`}
          </h1>
          <div className="page-desc">
            {isMine
              ? 'Ton portefeuille : chaque personne que tu as appelée en premier est à toi, du premier appel à la souscription.'
              : 'Vue superviseur : le tableau personnel de ce closer, en lecture-écriture.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/closing/classement" className="btn btn-secondary btn-sm">
            <Trophy size={13} />
            Classement
          </Link>
          <Link href="/closing/pipeline" className="btn btn-secondary btn-sm">
            <KanbanSquare size={13} />
            Suivi général
          </Link>
          <Link href="/closing/queue" className="btn btn-primary btn-sm">
            <PhoneOutgoing size={13} />
            File d'appels
          </Link>
        </div>
      </div>

      {canPick && pickable.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-3)',
              display: 'flex',
              gap: 5,
              alignItems: 'center',
            }}
          >
            <Users size={13} />
            Tableau de :
          </span>
          {pickable.map((c) => (
            <Link
              key={c.id}
              href={`/closing/mes-leads?closer=${c.id}`}
              className={c.id === viewedId ? 'badge badge-brand' : 'badge badge-neutral'}
              style={{ textDecoration: 'none' }}
            >
              {c.name ?? 'Sans nom'}
            </Link>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
        <strong style={{ color: 'var(--text-1)' }}>{cards.length}</strong> lead
        {cards.length > 1 ? 's' : ''} suivi{cards.length > 1 ? 's' : ''}
        {toCallBack > 0 && (
          <>
            {' · '}
            <strong style={{ color: 'var(--warning)' }}>{toCallBack}</strong> à rappeler
          </>
        )}
        {won > 0 && (
          <>
            {' · '}
            <strong style={{ color: 'var(--success)' }}>{won}</strong> gagné{won > 1 ? 's' : ''}
          </>
        )}
        {collected > 0 && (
          <>
            {' · '}
            <strong style={{ color: 'var(--success)' }}>
              {Math.round(collected).toLocaleString('fr-FR')} €
            </strong>{' '}
            placés par {isMine ? 'tes' : 'ses'} leads
          </>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="view-card">
          <div className="view-card-body" style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {isMine ? (
              <>
                Aucun lead attitré pour l'instant. Ouvre la{' '}
                <Link href="/closing/queue" style={{ color: 'var(--brand)' }}>
                  file d'appels
                </Link>
                , prends un lead et appelle-le : dès ton premier appel enregistré, il entre ici et
                il est à toi jusqu'au bout.
              </>
            ) : (
              'Aucun lead attitré à ce closer pour l’instant.'
            )}
          </div>
        </div>
      ) : (
        <PipelineBoard cards={cards} myId={user.id} />
      )}
    </>
  );
}
