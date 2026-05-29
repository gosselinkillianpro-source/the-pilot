'use client';

import {
  Check,
  GalleryHorizontal,
  Layers,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { generateCarouselAction, generatePostsAction } from '../posts/actions';
import {
  clearRejectedAction,
  deleteIdeaAction,
  generateIdeasAction,
  rejectIdeaAction,
  setMixAction,
  togglePriorityAction,
  unvalidateIdeaAction,
  validateAllPendingAction,
  validateIdeaAction,
} from './actions';

/** Recherche live : filtre les lignes d'idées par data-haystack. Raccourci "/" pour focus. */
export function IdeaSearch() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (e.key === '/' && tag !== 'input' && tag !== 'textarea') {
        e.preventDefault();
        ref.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value.trim().toLowerCase();
    for (const el of document.querySelectorAll<HTMLElement>('[data-idea-row]')) {
      const hay = el.dataset.haystack ?? '';
      el.style.display = !q || hay.includes(q) ? '' : 'none';
    }
  }

  return (
    <div style={{ position: 'relative', width: 240 }}>
      <Search
        size={14}
        style={{
          position: 'absolute',
          left: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-3)',
        }}
      />
      <input
        ref={ref}
        className="input"
        placeholder="Filtrer (touche /)"
        onChange={onInput}
        style={{ paddingLeft: 30, width: '100%' }}
      />
    </div>
  );
}

export function ValidateAllButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (count === 0) return null;
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={pending}
      onClick={() => {
        if (confirm(`Valider les ${count} idée(s) en attente ?`))
          startTransition(async () => {
            await validateAllPendingAction();
            router.refresh();
          });
      }}
    >
      Tout valider
    </button>
  );
}

type Mix = { projets: number; pedagogique: number; temoignages: number; mise_avant: number };
const CAT_META: { key: keyof Mix; label: string }[] = [
  { key: 'projets', label: 'Projets' },
  { key: 'pedagogique', label: 'Pédagogique' },
  { key: 'temoignages', label: 'Témoignages' },
  { key: 'mise_avant', label: 'Mise en avant Seven' },
];

export function MixEditor({
  initialMix,
  initialPostsPerWeek,
  actual,
}: {
  initialMix: Mix;
  initialPostsPerWeek: number;
  actual: Mix;
}) {
  const router = useRouter();
  const [mix, setMix] = useState<Mix>(initialMix);
  const [postsPerWeek, setPostsPerWeek] = useState(initialPostsPerWeek);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const total = mix.projets + mix.pedagogique + mix.temoignages + mix.mise_avant;
  const ideasNeeded = Math.ceil(postsPerWeek / 3);

  function setCat(key: keyof Mix, value: number) {
    setMix((m) => ({ ...m, [key]: Number.isFinite(value) ? value : 0 }));
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await setMixAction({ ...mix, postsPerWeek });
      if (!res.ok) setMsg(res.message);
      else {
        setMsg('Enregistré');
        router.refresh();
      }
    });
  }

  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title">Mix éditorial cible</div>
        <span style={{ fontSize: 12, color: total === 100 ? 'var(--success)' : 'var(--danger)' }}>
          Total : {total}%
        </span>
      </div>
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
          1 idée validée = 3 posts (FB/IG/LinkedIn). Pour {postsPerWeek} posts/semaine, il te faut ~
          {ideasNeeded} idées validées.
        </div>

        {/* Jauges réel vs cible */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {CAT_META.map((c) => {
            const target = mix[c.key];
            const current = actual[c.key];
            const inRange = current >= target - 5 && current <= target + 5;
            const color = inRange
              ? 'var(--ai)'
              : current < target
                ? 'var(--danger)'
                : 'var(--warning)';
            return (
              <div key={c.key}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {c.label}
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={100}
                      value={target}
                      onChange={(e) => setCat(c.key, Number.parseInt(e.target.value, 10))}
                      style={{ width: 60, padding: '2px 6px', fontSize: 12 }}
                    />
                    <span style={{ color: 'var(--text-3)' }}>%</span>
                  </span>
                  <span style={{ color: 'var(--text-3)' }}>
                    réel {current}% / cible {target}%
                  </span>
                </div>
                <div
                  style={{
                    position: 'relative',
                    height: 8,
                    borderRadius: 100,
                    background: 'var(--glass-bg-strong)',
                    overflow: 'visible',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(current, 100)}%`,
                      borderRadius: 100,
                      background: color,
                      transition: 'width 0.3s',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: -3,
                      left: `${Math.min(target, 100)}%`,
                      width: 2,
                      height: 14,
                      background: 'var(--text-1)',
                      borderRadius: 2,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div className="form-field" style={{ width: 140 }}>
            <label className="form-label" htmlFor="ppw">
              Posts / semaine
            </label>
            <input
              id="ppw"
              className="input"
              type="number"
              min={1}
              max={50}
              value={postsPerWeek}
              onChange={(e) => setPostsPerWeek(Number.parseInt(e.target.value, 10) || 1)}
            />
          </div>
          <div style={{ flex: 1 }} />
          {msg && (
            <span className={`badge ${msg === 'Enregistré' ? 'badge-success' : 'badge-danger'}`}>
              {msg}
            </span>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={pending || total !== 100}
            onClick={save}
          >
            Enregistrer le mix
          </button>
        </div>
      </div>
    </div>
  );
}

export function GenerateIdeasButton() {
  const [n, setN] = useState(10);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const res = await generateIdeasAction({ n });
      if (!res.ok) {
        setError(res.message);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {error && (
        <span className="badge badge-danger" title={error}>
          {error.slice(0, 40)}
        </span>
      )}
      <input
        className="input"
        type="number"
        min={3}
        max={25}
        value={n}
        onChange={(e) => setN(Number(e.target.value))}
        style={{ width: 64 }}
        disabled={pending}
        aria-label="Nombre d'idées"
      />
      <button type="button" className="btn btn-ai" onClick={handleGenerate} disabled={pending}>
        <Sparkles size={14} />
        {pending ? 'Génération via Grok…' : 'Générer'}
      </button>
    </div>
  );
}

function useAction() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  return { pending, run };
}

export function IdeaActions({
  ideaId,
  status,
  priority,
}: {
  ideaId: string;
  status: 'pending' | 'validated' | 'rejected';
  priority: boolean;
}) {
  const { pending, run } = useAction();

  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        title={priority ? 'Retirer des favoris' : 'Marquer prioritaire'}
        onClick={() => run(() => togglePriorityAction(ideaId, priority))}
        disabled={pending}
        style={{ color: priority ? 'var(--brand, #DAC99A)' : 'var(--text-3)' }}
      >
        <Star size={14} fill={priority ? 'currentColor' : 'none'} />
      </button>

      {status === 'pending' ? (
        <>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => run(() => validateIdeaAction(ideaId))}
            disabled={pending}
          >
            <Check size={14} /> Valider
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => run(() => rejectIdeaAction(ideaId))}
            disabled={pending}
          >
            <X size={14} /> Rejeter
          </button>
        </>
      ) : (
        <>
          {status === 'validated' && <GeneratePostsButtons ideaId={ideaId} />}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            title="Repasser en attente"
            onClick={() => run(() => unvalidateIdeaAction(ideaId))}
            disabled={pending}
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            title="Supprimer"
            onClick={() => {
              if (confirm('Supprimer cette idée ?')) run(() => deleteIdeaAction(ideaId));
            }}
            disabled={pending}
          >
            <Trash2 size={14} />
          </button>
        </>
      )}
    </div>
  );
}

function GeneratePostsButtons({ ideaId }: { ideaId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function gen(kind: 'posts' | 'carousel') {
    setErr(null);
    startTransition(async () => {
      const res =
        kind === 'posts'
          ? await generatePostsAction({ ideaId, withImage: false })
          : await generateCarouselAction({ ideaId, nSlides: 6 });
      if (!res.ok) {
        setErr(res.message);
        return;
      }
      router.push('/social/posts');
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ai btn-sm"
        title="Générer 3 posts (FB/IG/LinkedIn)"
        onClick={() => gen('posts')}
        disabled={pending}
      >
        <Layers size={14} /> {pending ? '…' : 'Posts'}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        title="Générer 3 carrousels (6 slides)"
        onClick={() => gen('carousel')}
        disabled={pending}
      >
        <GalleryHorizontal size={14} /> Carrousel
      </button>
      {err && (
        <span className="badge badge-danger" title={err}>
          {err.slice(0, 24)}
        </span>
      )}
    </>
  );
}

export function ClearRejectedButton({ count }: { count: number }) {
  const { pending, run } = useAction();
  if (count === 0) return null;
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={() => {
        if (confirm(`Supprimer les ${count} idée(s) rejetée(s) ?`))
          run(() => clearRejectedAction());
      }}
      disabled={pending}
    >
      <Trash2 size={14} /> Vider les rejetées
    </button>
  );
}
