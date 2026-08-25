'use client';

import { Phone, Radio, TrendingUp, User } from 'lucide-react';
import Link from 'next/link';
import { Kanban } from '@/components/shared/kanban';
import type { PipelineCard } from '@/lib/db/queries/webinar-pipeline';
import { parseCapacity } from '@/lib/webinars/call-order';
import { STAGES } from '@/lib/webinars/pipeline';
import { moveCardAction } from './actions';

/**
 * Le tableau de suivi des inscrits webinaire.
 *
 * Colonnes, glisser-déposer et déplacement optimiste viennent du kanban
 * partagé (`components/shared/kanban`) : ici ne vit que le CONTENU des cartes,
 * propre au webinaire (engagement au live, capacité déclarée, collecte).
 */

function fmtAgo(d: Date | null): string {
  if (!d) return '—';
  const ms = Date.now() - new Date(d).getTime();
  const j = Math.floor(ms / 86_400_000);
  if (j <= 0) return "aujourd'hui";
  if (j === 1) return 'hier';
  return `il y a ${j} j`;
}

function fmtDue(d: Date | null): string | null {
  if (!d) return null;
  const j = Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
  if (j < 0) return `rappel en retard de ${-j} j`;
  if (j === 0) return "rappel aujourd'hui";
  if (j === 1) return 'rappel demain';
  return `rappel dans ${j} j`;
}

const OUTCOME_LABEL: Record<string, string> = {
  reached: 'joint',
  no_answer: 'pas de réponse',
  voicemail: 'répondeur',
  wrong_number: 'mauvais numéro',
  callback_scheduled: 'rappel programmé',
  profile_incompatible: 'profil incompatible',
  in_progress: 'en cours',
};

/** Le kanban partagé identifie une carte par `id` et l'annonce par `title`. */
type BoardCard = PipelineCard & { id: string; title: string };

export function KanbanBoard({ cards, myId }: { cards: PipelineCard[]; myId: string }) {
  const board: BoardCard[] = cards.map((c) => ({ ...c, id: c.contactId, title: c.fullName }));

  return (
    <Kanban
      columns={STAGES}
      cards={board}
      onMove={async (card, stage) => {
        const res = await moveCardAction({ contactId: card.contactId, stage });
        return { ok: res.success, label: res.label, error: res.error };
      }}
      // Bordure verte : la personne a souscrit depuis le webinaire mais dort
      // encore dans une colonne intermédiaire — carte à faire avancer.
      isHighlighted={(c) => c.investedSince > 0 && c.stage !== 'invested' && c.stage !== 'lost'}
      renderCard={(card) => <Card card={card} mine={card.ownerUserId === myId} />}
      collapsedStages={['lost']}
      collapsedLabel="les perdus"
    />
  );
}

function Card({ card, mine }: { card: PipelineCard; mine: boolean }) {
  const capacity = parseCapacity(card.capacityRaw);
  const due = fmtDue(card.nextActionAt);
  const toPromote = card.investedSince > 0 && card.stage !== 'invested' && card.stage !== 'lost';

  return (
    <>
      <div>
        <div style={{ minWidth: 0 }}>
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
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {capacity.rank > 0 && (
          <span className={capacity.rank >= 4 ? 'badge badge-success' : 'badge badge-neutral'}>
            {capacity.label}
          </span>
        )}
        {card.watchedLive && (
          <span className="badge badge-brand">
            <Radio size={9} /> live
          </span>
        )}
        {card.onboardingComplete && <span className="badge badge-neutral">KYC ok</span>}
        {card.investedSince > 0 && (
          <span className="badge badge-success">
            <TrendingUp size={9} />
            {Math.round(card.investedSince).toLocaleString('fr-FR')} €
          </span>
        )}
      </div>

      {toPromote && (
        <div style={{ fontSize: 10.5, color: 'var(--success)', fontWeight: 600 }}>
          A souscrit depuis le webinaire — à passer en « A investi ».
        </div>
      )}

      <div style={{ fontSize: 10.5, color: 'var(--text-4)', lineHeight: 1.5 }}>
        {card.lastCallAt ? (
          <>
            Dernier appel {fmtAgo(card.lastCallAt)}
            {card.lastCallOutcome ? ` · ${OUTCOME_LABEL[card.lastCallOutcome] ?? ''}` : ''}
          </>
        ) : (
          'Jamais appelé'
        )}
        {due && (
          <>
            <br />
            <span style={{ color: due.includes('retard') ? 'var(--danger)' : 'var(--text-3)' }}>
              {due}
            </span>
          </>
        )}
        <br />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <User size={9} />
          {card.ownerName ? (mine ? 'Moi' : card.ownerName) : 'sans closer'}
        </span>
      </div>

      {card.webinarId && (
        <Link
          href={`/webinaires/${card.webinarId}`}
          style={{ fontSize: 10.5, color: 'var(--text-3)' }}
        >
          {card.webinarTitle && card.webinarTitle.length > 34
            ? `${card.webinarTitle.slice(0, 34)}…`
            : card.webinarTitle}{' '}
          →
        </Link>
      )}
    </>
  );
}
