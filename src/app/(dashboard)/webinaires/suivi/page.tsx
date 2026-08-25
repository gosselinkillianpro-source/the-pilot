import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getAuthenticatedUser } from '@/lib/auth';
import { listPipelineCards, listPipelineWebinars } from '@/lib/db/queries/webinar-pipeline';
import { stageColumn } from '@/lib/webinars/pipeline';
import { KanbanBoard } from './kanban-board';

export const dynamic = 'force-dynamic';

/**
 * Tableau de suivi des inscrits webinaire.
 *
 * Une carte naît quand un closer prend une fiche ou enregistre un appel ; elle
 * avance jusqu'à « A investi ». Le filtre par webinaire est en haut : après un
 * live, un closer ne veut voir que les gens de CE live.
 */

function fmtDate(d: Date | null): string {
  if (!d) return 'date inconnue';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default async function WebinarPipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ webinar?: string }>;
}) {
  const { webinar } = await searchParams;
  const [user, webinars] = await Promise.all([getAuthenticatedUser(), listPipelineWebinars()]);
  // Un identifiant inconnu dans l'URL ne doit pas vider le tableau en silence :
  // on retombe sur « tous les webinaires ».
  const selected = webinars.some((w) => w.id === webinar) ? webinar : undefined;
  const cards = await listPipelineCards(selected);

  const totalInvested = cards
    .filter((c) => c.stage === 'invested')
    .reduce((sum, c) => sum + c.investedSince, 0);
  const enCours = cards.filter((c) => c.stage !== 'invested' && c.stage !== 'lost').length;

  return (
    <>
      <div>
        <Link
          href="/webinaires"
          style={{
            fontSize: 12,
            color: 'var(--text-3)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 8,
          }}
        >
          <ArrowLeft size={13} />
          Tous les webinaires
        </Link>
        <h1 className="page-title">Suivi des inscrits</h1>
        <div className="page-desc">
          Une carte par personne prise en charge. Elle entre à gauche dès qu'un closer s'en occupe
          ou enregistre un appel, et se déplace jusqu'à la souscription.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterLink href="/webinaires/suivi" active={!selected} label="Tous les webinaires" />
        {webinars.map((w) => (
          <FilterLink
            key={w.id}
            href={`/webinaires/suivi?webinar=${w.id}`}
            active={selected === w.id}
            label={`${fmtDate(w.scheduledAt)} · ${w.cards}`}
          />
        ))}
      </div>

      {cards.length === 0 ? (
        <div className="view-card">
          <div className="view-card-body" style={{ fontSize: 13, color: 'var(--text-3)' }}>
            Personne en suivi{selected ? ' pour ce webinaire' : ''} pour l'instant. Ouvre un
            webinaire, clique <strong>« Je prends »</strong> sur un inscrit ou enregistre un appel :
            la carte apparaîtra ici.
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            <strong style={{ color: 'var(--text-1)' }}>{cards.length}</strong> fiche
            {cards.length > 1 ? 's' : ''} suivie{cards.length > 1 ? 's' : ''} ·{' '}
            <strong style={{ color: 'var(--text-1)' }}>{enCours}</strong> encore en cours
            {totalInvested > 0 && (
              <>
                {' · '}
                <strong style={{ color: 'var(--success)' }}>
                  {Math.round(totalInvested).toLocaleString('fr-FR')} €
                </strong>{' '}
                dans la colonne « {stageColumn('invested').label} »
              </>
            )}
          </div>
          <KanbanBoard cards={cards} myId={user.id} />
        </>
      )}
    </>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={active ? 'badge badge-brand' : 'badge badge-neutral'}
      style={{ textDecoration: 'none' }}
    >
      {label}
    </Link>
  );
}
