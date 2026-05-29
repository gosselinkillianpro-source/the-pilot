'use client';

import { Check, ChevronLeft, ChevronRight, Code, Download, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  deletePostAction,
  regenerateImageAction,
  schedulePostAction,
  setPostStatusAction,
  toggleImageModeAction,
  updatePostTextAction,
} from './actions';

export type PostCardData = {
  id: string;
  platform: string;
  text: string;
  isCarousel: boolean;
  noImage: boolean;
  hasImage: boolean;
  status: 'draft' | 'ready' | 'published';
  amfPassed: boolean | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  ideaTitle: string | null;
  slidesCount: number;
  updatedAt: string;
};

const PLATFORM_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
};

export function PostCard({ post }: { post: PostCardData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(post.text);
  const [slide, setSlide] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const v = `?v=${encodeURIComponent(post.updatedAt)}`;
  const visualSrc = post.isCarousel
    ? `/api/social/visual/slide/${post.id}/${slide}${v}`
    : `/api/social/visual/post/${post.id}${v}`;

  function run(fn: () => Promise<unknown>) {
    setErr(null);
    startTransition(async () => {
      const res = await fn();
      if (res && typeof res === 'object' && 'ok' in res && res.ok === false) {
        setErr((res as { message?: string }).message ?? 'Erreur');
        return;
      }
      router.refresh();
    });
  }

  async function copyHtml() {
    try {
      const res = await fetch(`/api/social/visual/post/${post.id}?export=1`);
      const html = await res.text();
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr('Copie impossible');
    }
  }

  return (
    <div className="view-card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge badge-brand">
            {PLATFORM_LABEL[post.platform] ?? post.platform}
          </span>
          {post.isCarousel && (
            <span className="badge badge-ai">Carrousel · {post.slidesCount}</span>
          )}
          {post.status === 'draft' && <span className="badge badge-warning">Brouillon</span>}
          {post.status === 'ready' && <span className="badge badge-success">Prêt</span>}
          {post.status === 'published' && <span className="badge badge-neutral">Publié</span>}
          {post.amfPassed === false && <span className="badge badge-danger">AMF ✕</span>}
        </div>

        {post.ideaTitle && (
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>💡 {post.ideaTitle}</div>
        )}

        {/* Aperçu visuel (iframe isolée) */}
        <div
          style={{
            position: 'relative',
            aspectRatio: '4 / 5',
            borderRadius: 10,
            overflow: 'hidden',
            background: 'var(--glass-bg-strong)',
            border: '1px solid var(--border)',
          }}
        >
          <iframe
            title={`visuel-${post.id}-${slide}`}
            src={visualSrc}
            style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
          />
          {post.isCarousel && post.slidesCount > 1 && (
            <>
              <button
                type="button"
                aria-label="Slide précédente"
                onClick={() => setSlide((s) => (s - 1 + post.slidesCount) % post.slidesCount)}
                style={navBtnStyle('left')}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                aria-label="Slide suivante"
                onClick={() => setSlide((s) => (s + 1) % post.slidesCount)}
                style={navBtnStyle('right')}
              >
                <ChevronRight size={18} />
              </button>
              <span
                style={{
                  position: 'absolute',
                  bottom: 8,
                  right: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#1A1A1A',
                  background: 'rgba(218,201,154,0.95)',
                  padding: '3px 9px',
                  borderRadius: 100,
                }}
              >
                {slide + 1} / {post.slidesCount}
              </span>
            </>
          )}
        </div>

        {/* Actions visuel */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={copyHtml}>
            <Code size={14} /> {copied ? 'Copié !' : 'Copier HTML/CSS'}
          </button>
          <a
            className="btn btn-ghost btn-sm"
            href={`/api/social/visual/${post.isCarousel ? `slide/${post.id}/${slide}` : `post/${post.id}`}`}
            target="_blank"
            rel="noreferrer"
          >
            Aperçu plein
          </a>
          {!post.isCarousel && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => run(() => regenerateImageAction(post.id))}
              disabled={pending}
            >
              {post.hasImage ? '🎨 Re-générer photo' : '🎨 Générer photo'}
            </button>
          )}
          {post.hasImage && (
            <>
              <a
                className="btn btn-ghost btn-sm"
                href={`/api/social/visual/post/${post.id}?export=1`}
                target="_blank"
                rel="noreferrer"
              >
                <Download size={14} /> Visuel
              </a>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => run(() => toggleImageModeAction(post.id, !post.noImage))}
                disabled={pending}
              >
                {post.noImage ? '🖼 Activer fond image' : 'Aa HTML pur'}
              </button>
            </>
          )}
        </div>

        {/* Texte éditable */}
        <textarea
          className="textarea"
          value={text}
          rows={6}
          onChange={(e) => setText(e.target.value)}
          style={{ fontSize: 13, lineHeight: 1.5 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{text.length} caractères</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => run(() => updatePostTextAction(post.id, text))}
            disabled={pending || text === post.text}
          >
            💾 Sauver texte
          </button>
        </div>

        {/* Planning */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div className="form-field" style={{ flex: 1 }}>
            <label className="form-label" htmlFor={`date-${post.id}`}>
              Date
            </label>
            <input
              id={`date-${post.id}`}
              className="input"
              type="date"
              defaultValue={post.scheduledDate ?? ''}
              onChange={(e) =>
                run(() =>
                  schedulePostAction(post.id, e.target.value, post.scheduledTime ?? '09:00'),
                )
              }
            />
          </div>
          <div className="form-field" style={{ width: 110 }}>
            <label className="form-label" htmlFor={`time-${post.id}`}>
              Heure
            </label>
            <input
              id={`time-${post.id}`}
              className="input"
              type="time"
              defaultValue={post.scheduledTime ?? '09:00'}
              onChange={(e) =>
                run(() => schedulePostAction(post.id, post.scheduledDate ?? '', e.target.value))
              }
            />
          </div>
        </div>

        {err && <div className="badge badge-danger">{err}</div>}

        {/* Statut */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            borderTop: '1px solid var(--border)',
            paddingTop: 12,
          }}
        >
          {post.status === 'draft' ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => run(() => setPostStatusAction(post.id, 'ready'))}
              disabled={pending}
            >
              <Check size={14} /> Marquer prêt
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => run(() => setPostStatusAction(post.id, 'draft'))}
              disabled={pending}
            >
              ↩ Brouillon
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (confirm('Supprimer ce post ?')) run(() => deletePostAction(post.id));
            }}
            disabled={pending}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function navBtnStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    [side]: 8,
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: 'rgba(26,26,26,0.75)',
    color: '#fff',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  };
}
