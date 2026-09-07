'use client';

import { ClipboardList, Phone, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CallResultForm } from '@/components/closing/call-result-form';

/**
 * « Appeler » ouvre la fenêtre de prise de notes en même temps que l'appel
 * (demande Killian, 7 sept. 2026) : le closer compose depuis le bouton et a
 * déjà sous les yeux le résultat, ce qui s'est dit, la suite et la note. Il
 * enregistre sans changer de page. « Résultat » ouvre la même fenêtre sans
 * composer (appel passé autrement, ou entrant).
 *
 * Fenêtre native <dialog> : focus piégé, Échap pour fermer, fond assombri.
 */
export function CallButtons({
  investorId,
  name,
  phone,
  missedAttempts,
  showResult = true,
  compact = false,
}: {
  investorId: string;
  name: string;
  phone: string | null;
  /** Appels sans réponse depuis le dernier contact abouti, AVANT cet appel. */
  missedAttempts: number;
  /** Afficher aussi « Résultat » (sans composer). */
  showResult?: boolean;
  /** Bouton téléphone icône seule (lignes denses). */
  compact?: boolean;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [dialing, setDialing] = useState(false);

  const openDialog = useCallback((withCall: boolean) => {
    setDialing(withCall);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // showModal() / close() suivent l'état React ; l'événement `close` natif
  // (Échap) remet l'état à jour.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  function startCall() {
    openDialog(true);
    if (phone) {
      // Compose depuis l'appareil (mobile : l'app téléphone ; poste : FaceTime,
      // Teams…). La fenêtre reste ouverte derrière pour la prise de notes.
      window.location.href = `tel:${phone}`;
    }
  }

  return (
    <>
      {phone ? (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={startCall}
          aria-label={compact ? `Appeler ${name}` : undefined}
          title="Appeler et prendre des notes"
        >
          <Phone size={13} />
          {compact ? null : 'Appeler'}
        </button>
      ) : null}
      {showResult ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => openDialog(false)}
          title="Enregistrer le résultat et la suite (sans composer)"
        >
          <ClipboardList size={13} />
          Résultat
        </button>
      ) : null}

      <dialog
        ref={ref}
        className="call-dialog"
        // Échap ferme nativement la fenêtre ; l'événement `close` remet l'état à jour.
        onClose={close}
        aria-label={`Appel — ${name}`}
      >
        {open ? (
          <div className="call-dialog-body">
            <div className="call-dialog-header">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {phone ? (
                    <a href={`tel:${phone}`} style={{ color: 'var(--brand)' }}>
                      {phone}
                    </a>
                  ) : (
                    'Sans téléphone'
                  )}
                  {dialing ? ' · appel en cours — prends tes notes ici' : ' · résultat de l’appel'}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={close}
                aria-label="Fermer"
              >
                <X size={14} />
              </button>
            </div>
            <CallResultForm
              investorId={investorId}
              name={name}
              missedAttempts={missedAttempts}
              onSaved={() => {
                close();
                router.refresh();
              }}
            />
          </div>
        ) : null}
      </dialog>
    </>
  );
}
