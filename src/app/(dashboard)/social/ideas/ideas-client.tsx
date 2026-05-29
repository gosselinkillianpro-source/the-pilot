'use client';

import {
  Check,
  GalleryHorizontal,
  Layers,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { generateCarouselAction, generatePostsAction } from '../posts/actions';
import {
  clearRejectedAction,
  deleteIdeaAction,
  generateIdeasAction,
  rejectIdeaAction,
  togglePriorityAction,
  unvalidateIdeaAction,
  validateIdeaAction,
} from './actions';

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
