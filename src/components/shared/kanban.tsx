'use client';

import { ArrowRight, GripVertical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useOptimistic, useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';

/**
 * Tableau kanban générique — colonnes, glisser-déposer, déplacement optimiste.
 *
 * Partagé par le suivi des inscrits webinaire et le suivi des appels closing :
 * les deux tableaux ont les mêmes gestes, seules les CARTES diffèrent. Chaque
 * écran fournit ses colonnes, ses cartes et le rendu de leur contenu ; toute la
 * mécanique (dépôt, non-régression visuelle, rafraîchissement) vit ici, en un
 * seul exemplaire.
 *
 * Accessibilité : le glisser-déposer est doublé d'un sélecteur « déplacer vers »
 * sur chaque carte. Le drag seul exclut le clavier, le lecteur d'écran et le
 * mobile — là où une bonne partie du travail se fait.
 */

export type KanbanColumn<S extends string> = {
  stage: S;
  label: string;
  /** Ce que la colonne veut dire, en une phrase. */
  hint: string;
  /** Variable CSS du thème, pour la pastille de colonne. */
  accent: string;
};

export type KanbanItem<S extends string> = {
  /** Identifiant stable de la carte (clé de déplacement). */
  id: string;
  stage: S;
  /** Nom affiché dans le retour de déplacement. */
  title: string;
};

export type MoveResult = { ok: boolean; label?: string; error?: string };

export function Kanban<S extends string, C extends KanbanItem<S>>({
  columns,
  cards,
  onMove,
  renderCard,
  isHighlighted,
  collapsedStages = [],
  collapsedLabel = 'les sortis',
  emptyLabel = 'Aucune fiche.',
}: {
  columns: KanbanColumn<S>[];
  cards: C[];
  /** Déplacement à valider côté serveur. La carte a déjà bougé à l'écran. */
  onMove: (card: C, stage: S) => Promise<MoveResult>;
  renderCard: (card: C) => ReactNode;
  /** Carte à signaler (bordure verte) — ex. « a souscrit, à faire avancer ». */
  isHighlighted?: (card: C) => boolean;
  /**
   * Colonnes de SORTIE, masquées par défaut (perdus, injoignables).
   *
   * Deux raisons : elles n'ont rien à voir avec le travail du jour — l'objectif
   * est de vider les listes, pas de contempler les sorties — et chaque colonne
   * en moins, c'est une colonne de plus qui tient à l'écran sans scroll.
   * Elles restent accessibles d'un clic, et on peut y déposer une carte.
   */
  collapsedStages?: S[];
  collapsedLabel?: string;
  emptyLabel?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<S | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  // La carte bouge d'abord à l'écran, le serveur confirme ensuite : un closer
  // qui traite trente fiches ne doit pas attendre le réseau à chaque geste.
  const [view, moveOptimistic] = useOptimistic(
    cards,
    (state: C[], move: { id: string; stage: S }) =>
      state.map((c) => (c.id === move.id ? { ...c, stage: move.stage } : c)),
  );

  function move(card: C, stage: S) {
    if (card.stage === stage) return;
    startTransition(async () => {
      moveOptimistic({ id: card.id, stage });
      const res = await onMove(card, stage);
      // Dans les deux cas on rafraîchit : en cas d'échec, l'état optimiste est
      // abandonné et la carte revient d'elle-même à sa colonne d'origine.
      router.refresh();
      if (res.ok) {
        toast(`${card.title} → ${res.label ?? 'déplacé'}`, { variant: 'success' });
      } else {
        toast(res.error ?? 'Déplacement impossible', { variant: 'error' });
      }
    });
  }

  // Colonnes de sortie : hors de l'écran tant que le closer ne les demande pas.
  const hidden = showClosed ? [] : collapsedStages;
  const visibleColumns = columns.filter((c) => !hidden.includes(c.stage));
  // Le compteur porte sur les colonnes de sortie, affichées ou non : il dit
  // combien de fiches y dorment, pas combien sont cachées à cet instant.
  const closedCount = view.filter((c) => collapsedStages.includes(c.stage)).length;

  return (
    <>
      {collapsedStages.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowClosed((v) => !v)}
            aria-expanded={showClosed}
          >
            {showClosed ? `Masquer ${collapsedLabel}` : `Voir ${collapsedLabel} (${closedCount})`}
          </button>
        </div>
      )}
      <KanbanGrid
        columns={visibleColumns}
        // Le sélecteur doit proposer TOUTES les colonnes, y compris masquées :
        // sans ça, on ne pourrait plus sortir quelqu'un de la file au clavier.
        allColumns={columns}
        cards={view}
        dragOver={dragOver}
        setDragOver={setDragOver}
        move={move}
        renderCard={renderCard}
        isHighlighted={isHighlighted}
        emptyLabel={emptyLabel}
      />
    </>
  );
}

/** La grille elle-même — séparée pour garder le composant principal lisible. */
function KanbanGrid<S extends string, C extends KanbanItem<S>>({
  columns,
  allColumns,
  cards,
  dragOver,
  setDragOver,
  move,
  renderCard,
  isHighlighted,
  emptyLabel,
}: {
  columns: KanbanColumn<S>[];
  allColumns: KanbanColumn<S>[];
  cards: C[];
  dragOver: S | null;
  setDragOver: (fn: (s: S | null) => S | null) => void;
  move: (card: C, stage: S) => void;
  renderCard: (card: C) => ReactNode;
  isHighlighted?: (card: C) => boolean;
  emptyLabel: string;
}) {
  return (
    // Le scroll horizontal vit ICI, jamais sur la page : sur mobile, la feuille
    // de style empile les colonnes (voir .kanban-board dans globals.css).
    <div className="kanban-board">
      {columns.map((col) => {
        const colCards = cards.filter((c) => c.stage === col.stage);
        const isTarget = dragOver === col.stage;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: zone de dépôt du glisser-déposer ; le déplacement au clavier passe par le sélecteur de chaque carte.
          <section
            key={col.stage}
            className="kanban-col"
            data-over={isTarget}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(() => col.stage);
            }}
            onDragLeave={() => setDragOver((s) => (s === col.stage ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(() => null);
              const id = e.dataTransfer.getData('text/plain');
              const card = cards.find((c) => c.id === id);
              if (card) move(card, col.stage);
            }}
            style={{ borderColor: isTarget ? col.accent : undefined }}
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
                  {emptyLabel}
                </div>
              ) : (
                colCards.map((card) => (
                  <article
                    key={card.id}
                    className="kanban-card"
                    data-promote={isHighlighted?.(card) ?? false}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', card.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <GripVertical
                        size={13}
                        style={{ color: 'var(--text-4)', marginTop: 2, flexShrink: 0 }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>{renderCard(card)}</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ArrowRight size={11} style={{ color: 'var(--text-4)' }} />
                      <select
                        aria-label={`Déplacer ${card.title} vers une autre colonne`}
                        value={card.stage}
                        onChange={(e) => move(card, e.target.value as S)}
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
                        {allColumns.map((c) => (
                          <option key={c.stage} value={c.stage}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
