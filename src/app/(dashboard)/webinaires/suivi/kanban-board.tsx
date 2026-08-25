'use client';

import { ArrowRight, GripVertical, Phone, Radio, TrendingUp, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useOptimistic, useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import type { PipelineCard } from '@/lib/db/queries/webinar-pipeline';
import { parseCapacity } from '@/lib/webinars/call-order';
import { STAGES, type WebinarStage } from '@/lib/webinars/pipeline';
import { moveCardAction } from './actions';

/**
 * Le tableau de suivi.
 *
 * Glisser-déposer natif (aucune dépendance ajoutée), doublé d'un sélecteur
 * « déplacer vers » sur chaque carte : le drag seul exclut le clavier, le
 * lecteur d'écran et le mobile, où l'essentiel du travail se fait.
 *
 * Le déplacement est optimiste — la carte change de colonne tout de suite, le
 * serveur suit. Un closer qui traite trente fiches ne doit pas attendre un
 * aller-retour réseau à chaque geste.
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

export function KanbanBoard({ cards, myId }: { cards: PipelineCard[]; myId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<WebinarStage | null>(null);

  // La carte bouge d'abord à l'écran, le serveur confirme ensuite.
  const [view, moveOptimistic] = useOptimistic(
    cards,
    (state: PipelineCard[], move: { contactId: string; stage: WebinarStage }) =>
      state.map((c) => (c.contactId === move.contactId ? { ...c, stage: move.stage } : c)),
  );

  function move(card: PipelineCard, stage: WebinarStage) {
    if (card.stage === stage) return;
    startTransition(async () => {
      moveOptimistic({ contactId: card.contactId, stage });
      const res = await moveCardAction({ contactId: card.contactId, stage });
      if (res.success) {
        router.refresh();
        toast(`${card.fullName} → ${res.label ?? 'déplacé'}`, { variant: 'success' });
      } else {
        // L'état optimiste est abandonné au refresh : la carte revient d'elle-même.
        router.refresh();
        toast(res.error ?? 'Déplacement impossible', { variant: 'error' });
      }
    });
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${STAGES.length}, minmax(230px, 1fr))`,
        gap: 12,
        overflowX: 'auto',
        paddingBottom: 8,
        alignItems: 'start',
      }}
    >
      {STAGES.map((col) => {
        const colCards = view.filter((c) => c.stage === col.stage);
        const isTarget = dragOver === col.stage;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: zone de dépôt du glisser-déposer ; le déplacement au clavier passe par le sélecteur de chaque carte.
          <section
            key={col.stage}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(col.stage);
            }}
            onDragLeave={() => setDragOver((s) => (s === col.stage ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const id = e.dataTransfer.getData('text/plain');
              const card = view.find((c) => c.contactId === id);
              if (card) move(card, col.stage);
            }}
            style={{
              background: isTarget ? 'var(--surface-3)' : 'var(--surface-2)',
              border: `1px solid ${isTarget ? col.accent : 'var(--border)'}`,
              borderRadius: 12,
              padding: 10,
              minHeight: 160,
              transition: 'background 120ms, border-color 120ms',
            }}
          >
            <header style={{ padding: '2px 4px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: col.accent,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>
                  {col.label}
                </span>
                <span className="badge badge-neutral" style={{ marginLeft: 'auto' }}>
                  {colCards.length}
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 3 }}>{col.hint}</div>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {colCards.length === 0 ? (
                <div style={{ fontSize: 11.5, color: 'var(--text-4)', padding: '10px 4px' }}>
                  Aucune fiche.
                </div>
              ) : (
                colCards.map((card) => (
                  <Card key={card.contactId} card={card} myId={myId} onMove={move} />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Card({
  card,
  myId,
  onMove,
}: {
  card: PipelineCard;
  myId: string;
  onMove: (card: PipelineCard, stage: WebinarStage) => void;
}) {
  const capacity = parseCapacity(card.capacityRaw);
  const due = fmtDue(card.nextActionAt);
  const mine = card.ownerUserId === myId;
  // Le montant souscrit depuis le webinaire signale une carte à faire avancer :
  // la personne a investi mais dort encore dans une colonne intermédiaire.
  const toPromote = card.investedSince > 0 && card.stage !== 'invested' && card.stage !== 'lost';

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', card.contactId);
        e.dataTransfer.effectAllowed = 'move';
      }}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${toPromote ? 'var(--success)' : 'var(--border-strong)'}`,
        borderRadius: 10,
        padding: 10,
        cursor: 'grab',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <GripVertical size={13} style={{ color: 'var(--text-4)', marginTop: 2, flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
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

      {/* Déplacement sans souris : indispensable au clavier et sur mobile. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <ArrowRight size={11} style={{ color: 'var(--text-4)' }} />
        <select
          aria-label={`Déplacer ${card.fullName} vers une autre colonne`}
          value={card.stage}
          onChange={(e) => onMove(card, e.target.value as WebinarStage)}
          style={{
            flex: 1,
            fontSize: 11,
            padding: '3px 6px',
            borderRadius: 6,
            border: '1px solid var(--border-strong)',
            background: 'var(--surface-2)',
            color: 'var(--text-2)',
          }}
        >
          {STAGES.map((s) => (
            <option key={s.stage} value={s.stage}>
              {s.label}
            </option>
          ))}
        </select>
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
    </article>
  );
}
