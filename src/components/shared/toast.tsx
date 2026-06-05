'use client';

/**
 * Système de notifications maison (sans dépendance externe).
 *
 * - `toast(message, opts)` : notification en bas de l'écran, auto-disparition (6 s par
 *   défaut), avec bouton « Annuler » optionnel (undo) qui rappelle une action.
 * - `runWithActivity(label, fn)` / `startActivity` / `endActivity` : indicateur
 *   « … en cours » en bas à droite tant qu'une opération tourne (ex. génération IA).
 *
 * Monté une seule fois dans le layout (cf. <ToastProvider> dans (dashboard)/layout.tsx).
 */

import { AlertTriangle, Check, Info, Loader2, RotateCcw, X } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

export type ToastUndo = {
  /** Libellé du bouton (défaut « Annuler »). */
  label?: string;
  /** Appelé au clic. Peut être async (on affiche un mini-loader le temps de l'undo). */
  onUndo: () => void | Promise<void>;
};

export type ToastOptions = {
  variant?: ToastVariant;
  /** Durée d'affichage en ms (défaut 6000). 0 = ne disparaît pas tout seul. */
  duration?: number;
  undo?: ToastUndo;
};

type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
  undo?: ToastUndo;
};

type ActivityItem = { id: string; label: string };

type ToastContextValue = {
  toast: (message: string, opts?: ToastOptions) => string;
  dismiss: (id: string) => void;
  startActivity: (label: string) => string;
  endActivity: (id: string) => void;
  /** Exécute `fn` en affichant l'indicateur d'activité tant qu'elle tourne. */
  runWithActivity: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast doit être utilisé à l’intérieur de <ToastProvider>.');
  return ctx;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

const DEFAULT_DURATION = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      clearTimer(id);
    },
    [clearTimer],
  );

  const toast = useCallback(
    (message: string, opts?: ToastOptions): string => {
      const id = nextId('toast');
      const duration = opts?.duration ?? DEFAULT_DURATION;
      setToasts((prev) => [
        ...prev,
        { id, message, variant: opts?.variant ?? 'success', duration, undo: opts?.undo },
      ]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  const startActivity = useCallback((label: string): string => {
    const id = nextId('act');
    setActivities((prev) => [...prev, { id, label }]);
    return id;
  }, []);

  const endActivity = useCallback((id: string) => {
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const runWithActivity = useCallback(
    async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
      const id = startActivity(label);
      try {
        return await fn();
      } finally {
        endActivity(id);
      }
    },
    [startActivity, endActivity],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ toast, dismiss, startActivity, endActivity, runWithActivity }),
    [toast, dismiss, startActivity, endActivity, runWithActivity],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} onToast={toast} />
      <ActivityDock activities={activities} />
    </ToastContext.Provider>
  );
}

const VARIANT_STYLE: Record<
  ToastVariant,
  { color: string; bg: string; border: string; icon: ReactNode }
> = {
  success: {
    color: 'var(--success)',
    bg: 'var(--success-bg)',
    border: 'color-mix(in srgb, var(--success) 30%, transparent)',
    icon: <Check size={16} />,
  },
  error: {
    color: 'var(--danger)',
    bg: 'var(--danger-bg)',
    border: 'color-mix(in srgb, var(--danger) 30%, transparent)',
    icon: <AlertTriangle size={16} />,
  },
  info: {
    color: 'var(--brand)',
    bg: 'var(--brand-bg)',
    border: 'color-mix(in srgb, var(--brand) 30%, transparent)',
    icon: <Info size={16} />,
  },
};

function Toaster({
  toasts,
  onDismiss,
  onToast,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onToast: (message: string, opts?: ToastOptions) => string;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 1000,
        pointerEvents: 'none',
        width: 'min(420px, calc(100vw - 32px))',
      }}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} item={t} onDismiss={onDismiss} onToast={onToast} />
      ))}
    </div>
  );
}

function ToastCard({
  item,
  onDismiss,
  onToast,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
  onToast: (message: string, opts?: ToastOptions) => string;
}) {
  const [undoing, setUndoing] = useState(false);
  const v = VARIANT_STYLE[item.variant];

  async function handleUndo() {
    if (!item.undo) return;
    setUndoing(true);
    try {
      await item.undo.onUndo();
      onDismiss(item.id);
      onToast('Action annulée.', { variant: 'info', duration: 3000 });
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Échec de l'annulation.", { variant: 'error' });
    } finally {
      setUndoing(false);
    }
  }

  return (
    <div
      role="status"
      style={{
        pointerEvents: 'auto',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '11px 12px',
        borderRadius: 10,
        background: 'var(--glass-bg-strong)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${v.border}`,
        boxShadow: 'var(--shadow-glass-lg)',
        animation: 'toast-in 0.18s ease',
      }}
    >
      <span style={{ color: v.color, display: 'flex', flexShrink: 0 }}>{v.icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)', lineHeight: 1.35 }}>
        {item.message}
      </span>
      {item.undo && (
        <button
          type="button"
          onClick={handleUndo}
          disabled={undoing}
          className="btn btn-sm btn-secondary"
          style={{ flexShrink: 0 }}
        >
          {undoing ? <Loader2 size={13} className="spin" /> : <RotateCcw size={13} />}
          {item.undo.label ?? 'Annuler'}
        </button>
      )}
      <button
        type="button"
        aria-label="Fermer"
        onClick={() => onDismiss(item.id)}
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 6,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-4)',
          cursor: 'pointer',
        }}
      >
        <X size={14} />
      </button>
      {item.duration > 0 && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            height: 2,
            width: '100%',
            background: v.color,
            transformOrigin: 'left',
            animation: `toast-progress ${item.duration}ms linear forwards`,
          }}
        />
      )}
    </div>
  );
}

function ActivityDock({ activities }: { activities: ActivityItem[] }) {
  if (activities.length === 0) return null;
  // On affiche la dernière activité (la plus récente) + un compteur s'il y en a plusieurs.
  const current = activities[activities.length - 1];
  const extra = activities.length - 1;
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 10,
        background: 'var(--glass-bg-strong)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border-strong)',
        boxShadow: 'var(--shadow-glass-lg)',
        maxWidth: 'min(360px, calc(100vw - 40px))',
      }}
    >
      <Loader2 size={16} className="spin" style={{ color: 'var(--brand)', flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {current?.label ?? 'Chargement…'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
          chargement en cours{extra > 0 ? ` · +${extra} autre${extra > 1 ? 's' : ''}` : ''}
        </span>
      </div>
    </div>
  );
}
