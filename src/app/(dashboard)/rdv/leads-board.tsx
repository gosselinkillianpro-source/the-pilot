'use client';

import { Phone, TrendingUp, User } from 'lucide-react';
import Link from 'next/link';
import { moveCardAction } from '@/app/(dashboard)/webinaires/suivi/actions';
import { Kanban } from '@/components/shared/kanban';
import type { PipelineCard } from '@/lib/db/queries/webinar-pipeline';
import { STAGES } from '@/lib/webinars/pipeline';

/**
 * Suivi des leads issus des rendez-vous.
 *
 * Mêmes colonnes et mêmes gestes que le suivi webinaire : un closer ne doit
 * pas réapprendre un tableau parce qu'il change d'onglet. Seul le contenu des
 * cartes change — ici, ce qui compte est le rendez-vous et la suite donnée.
 *
 * Le déplacement passe par l'action du suivi webinaire : elle travaille sur
 * `rdv_contacts`, la même table pour les deux populations.
 */

type BoardCard = PipelineCard & { id: string; title: string };

function fmtAgo(d: Date | null): string {
  if (!d) return 'jamais';
  const j = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (j <= 0) return "aujourd'hui";
  if (j === 1) return 'hier';
  return `il y a ${j} j`;
}

export function LeadsBoard({ cards, myId }: { cards: PipelineCard[]; myId: string }) {
  const board: BoardCard[] = cards.map((c) => ({ ...c, id: c.contactId, title: c.fullName }));

  return (
    <Kanban
      columns={STAGES}
      cards={board}
      onMove={async (card, stage) => {
        const res = await moveCardAction({ contactId: card.contactId, stage });
        return { ok: res.success, label: res.label, error: res.error };
      }}
      isHighlighted={(c) => c.investedSince > 0 && c.stage !== 'invested' && c.stage !== 'lost'}
      renderCard={(card) => <CardBody card={card} mine={card.ownerUserId === myId} />}
      collapsedStages={['lost']}
      collapsedLabel="les perdus"
      emptyLabel="Personne ici."
    />
  );
}

function CardBody({ card, mine }: { card: BoardCard; mine: boolean }) {
  return (
    <>
      {card.investorId ? (
        <Link
          href={`/closing/investor/${card.investorId}`}
          style={{
            display: 'block',
            fontSize: 12.5,
            fontWeight: 650,
            color: 'var(--text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {card.fullName}
        </Link>
      ) : (
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 650,
            color: 'var(--text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {card.fullName}
        </div>
      )}

      {card.phone && (
        <a
          href={`tel:${card.phone}`}
          style={{
            fontSize: 11,
            color: 'var(--brand)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <Phone size={10} />
          {card.phone}
        </a>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
        {card.investedSince > 0 && (
          <span className="badge badge-success">
            <TrendingUp size={9} />
            {Math.round(card.investedSince).toLocaleString('fr-FR')} €
          </span>
        )}
        {card.onboardingComplete === false && (
          <span className="badge badge-neutral">KYC à finir</span>
        )}
        {/* Pas de compte SAH : c'est le premier obstacle à lever, pas un détail. */}
        {!card.investorId && <span className="badge badge-warning">pas de compte SAH</span>}
      </div>

      <div style={{ fontSize: 10.5, color: 'var(--text-4)', lineHeight: 1.5, marginTop: 4 }}>
        Dernier appel {fmtAgo(card.lastCallAt)}
        {card.nextActionAt && (
          <>
            <br />
            <span style={{ color: 'var(--text-3)' }}>
              rappel{' '}
              {new Date(card.nextActionAt).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'short',
              })}
            </span>
          </>
        )}
        <br />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <User size={9} />
          {card.ownerName ? (mine ? 'Moi' : card.ownerName) : 'sans closer'}
        </span>
      </div>
    </>
  );
}
