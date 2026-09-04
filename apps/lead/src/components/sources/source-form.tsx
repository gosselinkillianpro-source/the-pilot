'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import {
  type FormState,
  rotateSecretAction,
  updateSourceAction,
} from '@/app/(app)/sources/actions';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import type { sources } from '@/lib/db/schema';

const DAY_LABELS: Record<string, string> = {
  '1': 'Lundi',
  '2': 'Mardi',
  '3': 'Mercredi',
  '4': 'Jeudi',
  '5': 'Vendredi',
  '6': 'Samedi',
  '7': 'Dimanche',
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? 'Enregistrement…' : 'Enregistrer'}
    </Button>
  );
}

export function SourceForm({
  source,
  appUrl,
}: {
  source: typeof sources.$inferSelect;
  appUrl: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    updateSourceAction.bind(null, source.id),
    null,
  );
  const [rotate, setRotate] = useState<FormState>(null);
  const [pending, start] = useTransition();
  const hours = source.serviceHours;
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <form action={action} className="stack" style={{ gap: 20 }}>
        <div className="card">
          <div className="card-head">Source</div>
          <div className="card-body form-grid">
            <Field label="Nom">
              <Input name="name" defaultValue={source.name} required />
            </Field>
            <Field label="Code (immuable)">
              <Input value={source.code} disabled />
            </Field>
            <Field label="Délai cible de rappel (min)">
              <Input name="slaTargetMin" type="number" min={1} defaultValue={source.slaTargetMin} />
            </Field>
            <Field label="Seuil d’alerte (min)">
              <Input name="slaAlertMin" type="number" min={1} defaultValue={source.slaAlertMin} />
            </Field>
            <Field label="Active">
              <label className="row" style={{ gap: 8, height: 40 }}>
                <input
                  type="checkbox"
                  className="checkbox"
                  name="active"
                  defaultChecked={source.active}
                />{' '}
                Reçoit des leads
              </label>
            </Field>
          </div>
        </div>
        <div className="card">
          <div className="card-head">Heures de service (heure de Paris)</div>
          <div className="card-body stack" style={{ gap: 8 }}>
            {Object.entries(DAY_LABELS).map(([d, label]) => {
              const h = hours[d as keyof typeof hours];
              return (
                <div key={d} className="row" style={{ gap: 12 }}>
                  <label className="row" style={{ gap: 8, width: 130, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      name={`day_${d}_on`}
                      defaultChecked={Boolean(h)}
                    />{' '}
                    {label}
                  </label>
                  <Input
                    name={`day_${d}_open`}
                    type="time"
                    defaultValue={h?.open ?? '09:00'}
                    style={{ width: 120 }}
                  />
                  <span className="hint">à</span>
                  <Input
                    name={`day_${d}_close`}
                    type="time"
                    defaultValue={h?.close ?? '20:00'}
                    style={{ width: 120 }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="card">
          <div className="card-head">SMS hors service</div>
          <div className="card-body">
            <Field
              label="Message envoyé au lead reçu hors service"
              hint="Variables : {prenom}, {source}, {reprise}."
            >
              <Textarea name="offHoursSms" defaultValue={source.offHoursSms ?? ''} />
            </Field>
          </div>
        </div>
        <div className="card">
          <div className="card-head">Script d’appel</div>
          <div className="card-body stack" style={{ gap: 14 }}>
            <Field
              label="1 · Présentation"
              hint="Variables : {prenom}, {setter}, {montant}, {objectif}, {urgence}."
            >
              <Textarea
                name="script_presentation"
                defaultValue={source.script?.presentation ?? ''}
              />
            </Field>
            <Field label="2 · Questions de capacité">
              <Textarea name="script_capacite" defaultValue={source.script?.capacite ?? ''} />
            </Field>
            <Field label="3 · Prise de créneau">
              <Textarea name="script_creneau" defaultValue={source.script?.creneau ?? ''} />
            </Field>
            <Field label="Phrases interdites (une par ligne)">
              <Textarea
                name="script_interdits"
                defaultValue={(source.script?.interdits ?? []).join('\n')}
              />
            </Field>
          </div>
        </div>
        {state?.error ? <p className="error">{state.error}</p> : null}
        {state?.ok ? <p className="notice">{state.ok}</p> : null}
        <div className="form-actions">
          <Submit />
        </div>
      </form>

      <div className="stack" style={{ gap: 18 }}>
        <div className="card">
          <div className="card-head">Webhook du site</div>
          <div className="card-body stack" style={{ gap: 10, fontSize: 14 }}>
            <p>
              Réception canonique : <code className="num">POST {appUrl}/api/v1/leads</code>
            </p>
            {source.code === 'mep' ? (
              <p>
                Diagnostic MEP (format natif) :{' '}
                <code className="num">POST {appUrl}/api/v1/leads/mep-site</code>
              </p>
            ) : null}
            <p className="hint">
              En-tête <code>X-Source-Key</code> = secret de la source. Le secret n’est jamais
              affiché après sa génération : il vit dans la config du site, hors docroot.
            </p>
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (
                  !window.confirm(
                    'Générer un nouveau secret ? L’ancien cessera immédiatement de fonctionner.',
                  )
                )
                  return;
                start(async () => setRotate(await rotateSecretAction(source.id)));
              }}
            >
              Régénérer le secret
            </Button>
            {rotate?.secret ? (
              <div
                className="banner banner-warning"
                style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}
              >
                <strong>Nouveau secret (affiché une seule fois) :</strong>
                <code className="num" style={{ wordBreak: 'break-all' }}>
                  {rotate.secret}
                </code>
              </div>
            ) : null}
            {rotate?.error ? <p className="error">{rotate.error}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
