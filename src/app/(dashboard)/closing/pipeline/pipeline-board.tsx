'use client';

import { AlertTriangle, Phone, TrendingUp, User, Wallet } from 'lucide-react';
import Link from 'next/link';
import { Kanban, type KanbanColumn } from '@/components/shared/kanban';
import {
  CLOSING_COLUMNS,
  CLOSING_STAGE_LABELS,
  type ClosingStage,
  columnForStage,
  MAX_CALL_ATTEMPTS,
  queueSourceLabel,
} from '@/lib/closing/pipeline';
import type { ClosingCard } from '@/lib/db/queries/closing-pipeline';
import { moveClosingCardAction } from './actions';

/**
 * Le tableau de suivi des appels.
 *
 * Chaque carte porte ce qu'il faut pour décider du prochain geste : combien de
 * fois on a essayé, ce qu'a donné le dernier appel, s'il reste un rappel
 * programmé, et ce que la personne a déjà placé.
 */

const OUTCOME_LABEL: Record<string, string> = {
  reached: 'joint',
  no_answer: 'pas de réponse',
  voicemail: 'répondeur',
  wrong_number: 'mauvais numéro',
  callback_scheduled: 'rappel programmé',
  profile_incompatible: 'profil incompatible',
  in_progress: 'en cours',
};

function fmtAgo(d: Date | null): string {
  if (!d) return 'jamais';
  const j = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
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

/**
 * Les cartes du kanban générique ont besoin d'un `id` et d'un `title`.
 * `stage` porte la COLONNE d'affichage, `realStage` l'étape réelle en base :
 * les deux diffèrent pour les étapes repliées (« RDV fait » dans « RDV »).
 */
type BoardCard = ClosingCard & { id: string; title: string; realStage: ClosingStage };

const COLUMNS: KanbanColumn<ClosingStage>[] = CLOSING_COLUMNS.map((c) => ({
  stage: c.stage,
  label: c.label,
  hint: c.hint,
  accent: c.accent,
}));

export function PipelineBoard({ cards, myId }: { cards: ClosingCard[]; myId: string }) {
  // Les étapes repliées (« RDV fait », « En sommeil ») s'affichent dans la
  // colonne qui les absorbe, sinon leurs cartes seraient invisibles.
  const board: BoardCard[] = cards.map((c) => ({
    ...c,
    id: c.investorId,
    title: c.fullName,
    realStage: c.stage,
    stage: columnForStage(c.stage)?.stage ?? c.stage,
  }));

  return (
    <Kanban
      columns={COLUMNS}
      cards={board}
      onMove={async (card, stage) => {
        const res = await moveClosingCardAction({ investorId: card.investorId, stage });
        // L'échec doit revenir en toast d'erreur, jamais en fausse réussite :
        // la carte optimiste reviendra d'elle-même à sa colonne au refresh.
        return res.success ? { ok: true, label: res.label } : { ok: false, error: res.error };
      }}
      // Comparer l'étape RÉELLE : une carte « RDV fait » repliée dans « RDV »
      // doit pouvoir être ramenée à « RDV pris » (même colonne à l'écran).
      isNoopMove={(card, stage) => card.realStage === stage}
      // Bordure verte : la personne a investi mais dort dans une autre colonne.
      isHighlighted={(c) => c.totalInvested > 0 && c.realStage !== 'closed_won'}
      renderCard={(card) => <CardBody card={card} mine={card.ownerId === myId} />}
      // Les sortis de file ne prennent pas une colonne à l'écran : le but est
      // de vider les listes, pas d'admirer les pertes. Un clic les rouvre.
      collapsedStages={['closed_lost']}
      collapsedLabel="les sortis de la file"
      emptyLabel="Personne ici."
    />
  );
}

function CardBody({ card, mine }: { card: BoardCard; mine: boolean }) {
  const due = fmtDue(card.nextActionAt);
  const wallet = card.walletBalanceCents != null ? card.walletBalanceCents / 100 : 0;
  // Compte à rebours affiché seulement là où il décide de quelque chose.
  const attemptsLeft = MAX_CALL_ATTEMPTS - card.missedAttempts;
  const showAttempts = card.realStage === 'to_call_back' && card.missedAttempts > 0;

  return (
    <>
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
        {showAttempts && (
          <span className={attemptsLeft <= 1 ? 'badge badge-danger' : 'badge badge-warning'}>
            <AlertTriangle size={9} />
            {card.missedAttempts}/{MAX_CALL_ATTEMPTS} sans réponse
          </span>
        )}
        {card.totalInvested > 0 && (
          <span className="badge badge-success">
            <TrendingUp size={9} />
            {Math.round(card.totalInvested).toLocaleString('fr-FR')} €
          </span>
        )}
        {wallet >= 100 && (
          <span className="badge badge-brand">
            <Wallet size={9} />
            {Math.round(wallet).toLocaleString('fr-FR')} € dispo
          </span>
        )}
        {!card.onboardingComplete && <span className="badge badge-neutral">KYC à finir</span>}
        {card.isBreach && <span className="badge badge-ai">BREACH</span>}
      </div>

      {showAttempts && attemptsLeft <= 1 && (
        <div style={{ fontSize: 10.5, color: 'var(--danger)', fontWeight: 600, marginTop: 2 }}>
          Dernier essai avant sortie automatique de la file.
        </div>
      )}

      <div style={{ fontSize: 10.5, color: 'var(--text-4)', lineHeight: 1.5, marginTop: 4 }}>
        {card.callCount > 0 ? (
          <>
            {card.callCount} appel{card.callCount > 1 ? 's' : ''} · dernier{' '}
            {fmtAgo(card.lastCallAt)}
            {card.lastCallOutcome ? ` · ${OUTCOME_LABEL[card.lastCallOutcome] ?? ''}` : ''}
          </>
        ) : (
          'Aucun appel enregistré'
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
          {card.ownerName ? (mine ? 'Moi' : card.ownerName) : 'sans closer'} ·{' '}
          {queueSourceLabel(card.source)}
        </span>
        {/* L'étape réelle quand elle diffère du libellé de la colonne : une
            carte « RDV fait » ne doit pas se lire comme un simple « RDV pris ». */}
        {card.realStage !== card.stage && (
          <>
            <br />
            <span style={{ color: 'var(--text-3)' }}>{CLOSING_STAGE_LABELS[card.realStage]}</span>
          </>
        )}
      </div>
    </>
  );
}
