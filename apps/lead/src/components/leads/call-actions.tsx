'use client';

import { CalendarPlus, Clock, PhoneCall, PhoneOff, Sprout, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  type ActionResult,
  bookAction,
  callbackLaterAction,
  nurtureAction,
  outOfTargetAction,
  reopenAction,
  startCallAction,
  unreachableAction,
} from '@/app/(app)/leads/[id]/actions';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { HORS_CIBLE_LABELS, NURTURE_LABELS } from '@/lib/domain/event-labels';
import { EXCLUSION_LABELS, type ExclusionReason } from '@/lib/domain/routing';
import type { LeadState } from '@/lib/domain/state-machine';

export type BuyerOption = {
  id: string;
  name: string;
  bookingUrl?: string;
  durationMin: number;
  priceCents: number;
};

type Mode = null | 'book' | 'later' | 'nurture' | 'hors' | 'injoignable';

/**
 * Les six boutons de disposition de la fiche d'appel (section 4.3).
 * Toute la logique est côté serveur ; ici on ne fait qu'ouvrir un petit
 * formulaire et afficher le résultat.
 */
export function CallActions({
  leadId,
  state,
  phoneE164,
  buyers,
  eligible,
  excluded,
  isAdmin,
}: {
  leadId: string;
  state: LeadState;
  phoneE164: string;
  buyers: BuyerOption[];
  eligible: { buyerId: string; name: string }[];
  excluded: { buyerId: string; name: string; reason: ExclusionReason }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState<string | null>(null);

  const first = eligible[0];
  const [buyerId, setBuyerId] = useState(first?.buyerId ?? buyers[0]?.id ?? '');
  const [when, setWhen] = useState('');
  const [notes, setNotes] = useState('');
  const [routingReason, setRoutingReason] = useState('');
  const [laterAt, setLaterAt] = useState('');
  const [nurtureReason, setNurtureReason] = useState('curiosite');
  const [horsReason, setHorsReason] = useState('montant_hors_criteres');
  const [horsNote, setHorsNote] = useState('');
  const [outcome, setOutcome] = useState<'messagerie' | 'occupe'>('messagerie');

  function handle(promise: Promise<ActionResult>) {
    setError(null);
    start(async () => {
      const r = await promise;
      if (r.ok) {
        if (r.message) toast.push(r.message);
        setMode(null);
        router.refresh();
      } else {
        setError(r.error);
        toast.push(r.error, 'error');
      }
    });
  }

  const canCall = ['a_rappeler', 'a_rappeler_plus_tard', 'injoignable'].includes(state);
  const inCall = state === 'en_appel' || state === 'qualifie';
  const closed = ['hors_cible', 'a_nourrir'].includes(state);
  const selectedBuyer = buyers.find((b) => b.id === buyerId);
  const chosenNotFirst = first && buyerId !== first.buyerId;

  return (
    <div className="stack" style={{ gap: 14 }}>
      {canCall ? (
        <a
          href={`tel:${phoneE164}`}
          className="btn btn-primary btn-lg"
          onClick={() => handle(startCallAction(leadId))}
          style={{ justifyContent: 'center' }}
        >
          <PhoneCall /> J’appelle
        </a>
      ) : null}

      {inCall ? (
        <div className="row" style={{ gap: 8 }}>
          <Button
            variant="primary"
            onClick={() => setMode(mode === 'book' ? null : 'book')}
            disabled={pending}
          >
            <CalendarPlus /> RDV posé
          </Button>
          <Button onClick={() => setMode(mode === 'later' ? null : 'later')} disabled={pending}>
            <Clock /> Rappeler plus tard
          </Button>
          <Button onClick={() => setMode(mode === 'nurture' ? null : 'nurture')} disabled={pending}>
            <Sprout /> À nourrir
          </Button>
          <Button onClick={() => setMode(mode === 'hors' ? null : 'hors')} disabled={pending}>
            <XCircle /> Hors cible
          </Button>
          <Button
            onClick={() => setMode(mode === 'injoignable' ? null : 'injoignable')}
            disabled={pending}
          >
            <PhoneOff /> Injoignable
          </Button>
        </div>
      ) : null}

      {closed && isAdmin ? (
        <Button variant="ghost" onClick={() => handle(reopenAction(leadId))} disabled={pending}>
          Remettre à rappeler
        </Button>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      {mode === 'book' ? (
        <div className="card card-body stack">
          <div className="form-grid">
            <Field
              label="Acheteur"
              hint={
                first
                  ? `Proposé par le routage : ${first.name}`
                  : 'Aucun acheteur éligible : le lead restera « qualifié », à router à la main.'
              }
            >
              <Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
                {buyers.map((b) => {
                  const ex = excluded.find((x) => x.buyerId === b.id);
                  return (
                    <option key={b.id} value={b.id} disabled={Boolean(ex)}>
                      {b.name}
                      {ex ? ` — ${EXCLUSION_LABELS[ex.reason]}` : ''}
                    </option>
                  );
                })}
              </Select>
            </Field>
            <Field label="Date et heure du rendez-vous (heure de Paris)">
              <Input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                required
              />
            </Field>
          </div>
          {selectedBuyer?.bookingUrl ? (
            <p className="hint">
              Posez le créneau pendant l’appel dans l’agenda de {selectedBuyer.name} :{' '}
              <a
                href={selectedBuyer.bookingUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--brand-text)', fontWeight: 600 }}
              >
                ouvrir l’agenda ↗
              </a>{' '}
              puis reportez la date ici.
            </p>
          ) : null}
          {chosenNotFirst ? (
            <Field label="Motif du choix d’un autre acheteur (obligatoire)">
              <Input
                value={routingReason}
                onChange={(e) => setRoutingReason(e.target.value)}
                placeholder="Ex. : le lead demande un expert dans sa région"
              />
            </Field>
          ) : null}
          <Field
            label="Notes pour l’acheteur (fiche transmise)"
            hint="Contexte utile au rendez-vous. Jamais de produit ni de recommandation."
          >
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setMode(null)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              disabled={pending || !buyerId || !when}
              onClick={() =>
                handle(
                  bookAction(leadId, {
                    buyerId,
                    scheduledLocal: when,
                    durationMin: selectedBuyer?.durationMin,
                    setterNotes: notes,
                    routingReason,
                  }),
                )
              }
            >
              Confirmer le rendez-vous
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'later' ? (
        <div className="card card-body stack">
          <Field label="Rappeler le (heure de Paris)">
            <Input
              type="datetime-local"
              value={laterAt}
              onChange={(e) => setLaterAt(e.target.value)}
              required
            />
          </Field>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setMode(null)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              disabled={pending || !laterAt}
              onClick={() => handle(callbackLaterAction(leadId, laterAt))}
            >
              Programmer le rappel
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'nurture' ? (
        <div className="card card-body stack">
          <Field label="Motif">
            <Select value={nurtureReason} onChange={(e) => setNurtureReason(e.target.value)}>
              {Object.entries(NURTURE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setMode(null)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => handle(nurtureAction(leadId, nurtureReason))}
            >
              Sortir du flux téléphonique
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'hors' ? (
        <div className="card card-body stack">
          <Field label="Motif (obligatoire)">
            <Select value={horsReason} onChange={(e) => setHorsReason(e.target.value)}>
              {Object.entries(HORS_CIBLE_LABELS)
                .filter(([k]) => k !== 'doublon')
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Précision (facultatif)">
            <Input value={horsNote} onChange={(e) => setHorsNote(e.target.value)} />
          </Field>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setMode(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => handle(outOfTargetAction(leadId, horsReason, horsNote))}
            >
              Classer hors cible
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'injoignable' ? (
        <div className="card card-body stack">
          <Field label="Résultat de l’appel">
            <Select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as 'messagerie' | 'occupe')}
            >
              <option value="messagerie">Messagerie</option>
              <option value="occupe">Occupé / pas de réponse</option>
            </Select>
          </Field>
          <p className="hint">
            Relances automatiques : +30 min, +3 h, lendemain 10 h. SMS avec lien de créneau après la
            deuxième.
          </p>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setMode(null)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => handle(unreachableAction(leadId, outcome))}
            >
              Enregistrer la tentative
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
