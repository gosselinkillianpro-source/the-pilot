import { PhoneOutgoing } from 'lucide-react';
import Link from 'next/link';
import { getAuthenticatedUser } from '@/lib/auth';
import { MAX_CALL_ATTEMPTS, QUEUE_SOURCES, queueSourceLabel } from '@/lib/closing/pipeline';
import {
  countBySource,
  listClosingCards,
  type NetworkFilter,
} from '@/lib/db/queries/closing-pipeline';
import { PipelineBoard } from './pipeline-board';

export const dynamic = 'force-dynamic';

/**
 * Suivi des appels — ce qui se passe APRÈS avoir décroché le téléphone.
 *
 * Jusqu'ici la boucle s'arrêtait à la qualification : on disait « pas de
 * réponse » et la personne disparaissait jusqu'à ce que la file la remonte
 * d'elle-même. Elle atterrit maintenant dans une colonne, avec le compte des
 * tentatives et la sortie automatique au bout de trois.
 */

/** Mêmes onglets que la file d'appels : on travaille le même périmètre. */
const NETWORK_TABS: { value: NetworkFilter; label: string }[] = [
  { value: 'breach', label: 'BREACH (mes pubs)' },
  { value: 'all', label: 'Tous' },
  { value: 'other', label: 'Hors BREACH' },
];

export default async function ClosingPipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; reseau?: string }>;
}) {
  const { source, reseau } = await searchParams;
  const known = QUEUE_SOURCES.some((s) => s.key === source);
  const selected = known ? source : undefined;
  // BREACH par défaut : c'est le périmètre travaillé au quotidien — les
  // inscrits venus du code, pas toute la base.
  const network: NetworkFilter = NETWORK_TABS.some((t) => t.value === reseau)
    ? (reseau as NetworkFilter)
    : 'breach';

  const [user, cards, counts] = await Promise.all([
    getAuthenticatedUser(),
    listClosingCards({ source: selected, network }),
    countBySource(network),
  ]);
  const qs = (params: { source?: string; reseau?: NetworkFilter }) => {
    const p = new URLSearchParams();
    if (params.source) p.set('source', params.source);
    if (params.reseau && params.reseau !== 'breach') p.set('reseau', params.reseau);
    const q = p.toString();
    return q ? `/closing/pipeline?${q}` : '/closing/pipeline';
  };

  const total = counts.reduce((sum, c) => sum + c.cards, 0);
  const toCallBack = cards.filter((c) => c.stage === 'to_call_back').length;
  const lastChance = cards.filter(
    (c) => c.stage === 'to_call_back' && c.missedAttempts >= MAX_CALL_ATTEMPTS - 1,
  ).length;

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
          <h1 className="page-title">Suivi des appels</h1>
          <div className="page-desc">
            Tout le monde qu'on a appelé, et où en est chacun. Une carte entre ici dès qu'un appel
            est enregistré ; le résultat de la qualification la range tout seul.
          </div>
        </div>
        <Link href="/closing/queue" className="btn btn-secondary btn-sm">
          <PhoneOutgoing size={13} />
          File d'appels
        </Link>
      </div>

      {/* Réseau d'acquisition : le filtre qui compte au quotidien. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {NETWORK_TABS.map((t) => (
          <FilterLink
            key={t.value}
            href={qs({ source: selected, reseau: t.value })}
            active={network === t.value}
            label={t.label}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterLink
          href={qs({ reseau: network })}
          active={!selected}
          label={`Toutes les files · ${total}`}
        />
        {QUEUE_SOURCES.map((s) => {
          const n = counts.find((c) => c.source === s.key)?.cards ?? 0;
          if (n === 0) return null;
          return (
            <FilterLink
              key={s.key}
              href={qs({ source: s.key, reseau: network })}
              active={selected === s.key}
              label={`${s.label} · ${n}`}
            />
          );
        })}
        {/* Les fiches travaillées avant l'existence du tableau n'ont pas de file
            d'origine : on l'affiche tel quel plutôt que de leur en inventer une. */}
        {(counts.find((c) => c.source === null)?.cards ?? 0) > 0 && (
          <span className="badge badge-neutral">
            {queueSourceLabel(null)} · {counts.find((c) => c.source === null)?.cards}
          </span>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="view-card">
          <div className="view-card-body" style={{ fontSize: 13, color: 'var(--text-3)' }}>
            Personne en suivi{selected ? ' pour cette file' : ''}. Ouvre la{' '}
            <Link href="/closing/queue" style={{ color: 'var(--brand)' }}>
              file d'appels
            </Link>
            , appelle quelqu'un et clique <strong>« Appelé »</strong> : sa carte apparaîtra ici.
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            <strong style={{ color: 'var(--text-1)' }}>{cards.length}</strong> fiche
            {cards.length > 1 ? 's' : ''} suivie{cards.length > 1 ? 's' : ''}
            {toCallBack > 0 && (
              <>
                {' · '}
                <strong style={{ color: 'var(--warning)' }}>{toCallBack}</strong> à rappeler
              </>
            )}
            {lastChance > 0 && (
              <>
                {' · '}
                <strong style={{ color: 'var(--danger)' }}>{lastChance}</strong> au dernier essai
                avant sortie de la file
              </>
            )}
          </div>
          <PipelineBoard cards={cards} myId={user.id} />
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
