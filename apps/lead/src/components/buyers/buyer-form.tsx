'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { FormState } from '@/app/(app)/acheteurs/actions';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import type { BuyerCriteria, buyers } from '@/lib/db/schema';
import { MEP_SCALES, MEP_VALUE_LABELS } from '@/lib/domain/answers/mep';

type BuyerRow = typeof buyers.$inferSelect;

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? 'Enregistrement…' : label}
    </Button>
  );
}

function ScaleSelect({
  name,
  scaleKey,
  value,
  placeholder,
}: {
  name: string;
  scaleKey: string;
  value?: string;
  placeholder: string;
}) {
  return (
    <Select name={name} defaultValue={value ?? ''}>
      <option value="">{placeholder}</option>
      {(MEP_SCALES[scaleKey] ?? []).map((v) => (
        <option key={v} value={v}>
          {MEP_VALUE_LABELS[scaleKey]?.[v] ?? v}
        </option>
      ))}
    </Select>
  );
}

function Checks({
  name,
  options,
  selected,
}: {
  name: string;
  options: [string, string][];
  selected: string[];
}) {
  return (
    <div className="row" style={{ gap: 12 }}>
      {options.map(([v, label]) => (
        <label key={v} className="row" style={{ gap: 6, fontSize: 14 }}>
          <input
            type="checkbox"
            className="checkbox"
            name={name}
            value={v}
            defaultChecked={selected.includes(v)}
          />{' '}
          {label}
        </label>
      ))}
    </div>
  );
}

const CRITERIA: [string, string][] = [
  ['montant_min', 'Montant minimum'],
  ['objectifs', 'Objectifs'],
  ['timing_max', 'Timing maximum'],
  ['impot_min', 'Impôt minimum'],
  ['patrimoine_min', 'Patrimoine minimum'],
  ['age', 'Tranche d’âge'],
  ['exclusions', 'Exclusions'],
];

export function BuyerForm({
  action,
  sources,
  buyer,
  submitLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  sources: { id: string; name: string }[];
  buyer?: BuyerRow;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const c: BuyerCriteria = buyer?.criteria ?? { obligatoires: [] };
  return (
    <form action={formAction} className="stack" style={{ gap: 22 }}>
      <div className="card">
        <div className="card-head">Identité</div>
        <div className="card-body form-grid">
          <Field label="Source">
            <Select name="sourceId" defaultValue={buyer?.sourceId ?? sources[0]?.id ?? ''} required>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nom (affiché aux setters et aux leads)">
            <Input name="name" defaultValue={buyer?.name ?? ''} required />
          </Field>
          <Field label="Raison sociale">
            <Input name="legalName" defaultValue={buyer?.legalName ?? ''} />
          </Field>
          <Field label="Numéro ORIAS (obligatoire)">
            <Input name="oriasNumber" defaultValue={buyer?.oriasNumber ?? ''} required />
          </Field>
          <Field label="Contact">
            <Input name="contactName" defaultValue={buyer?.contactName ?? ''} />
          </Field>
          <Field label="Email de contact (reçoit les fiches)">
            <Input
              name="contactEmail"
              type="email"
              defaultValue={buyer?.contactEmail ?? ''}
              required
            />
          </Field>
          <Field label="Téléphone">
            <Input name="contactPhone" defaultValue={buyer?.contactPhone ?? ''} />
          </Field>
        </div>
      </div>

      <div className="card">
        <div className="card-head">Critères d’acceptation</div>
        <div className="card-body stack" style={{ gap: 16 }}>
          <div className="form-grid">
            <Field label="Montant minimum">
              <ScaleSelect
                name="montant_min"
                scaleKey="montant"
                value={c.montant_min}
                placeholder="Aucun"
              />
            </Field>
            <Field label="Timing maximum" hint="Le lead doit se projeter au plus tard…">
              <ScaleSelect
                name="timing_max"
                scaleKey="urgence"
                value={c.timing_max}
                placeholder="Aucun"
              />
            </Field>
            <Field label="Impôt annuel minimum">
              <ScaleSelect
                name="impot_min"
                scaleKey="impot_annuel"
                value={c.impot_min}
                placeholder="Aucun"
              />
            </Field>
            <Field label="Patrimoine minimum">
              <ScaleSelect
                name="patrimoine_min"
                scaleKey="patrimoine"
                value={c.patrimoine_min}
                placeholder="Aucun"
              />
            </Field>
          </div>
          <Field label="Objectifs acceptés">
            <Checks
              name="objectifs"
              options={Object.entries(MEP_VALUE_LABELS.objectif ?? {})}
              selected={c.objectifs ?? []}
            />
          </Field>
          <Field label="Tranches d’âge acceptées (vide = toutes)">
            <Checks
              name="age"
              options={Object.entries(MEP_VALUE_LABELS.age ?? {})}
              selected={c.age ?? []}
            />
          </Field>
          <Field label="Exclusions : situation professionnelle">
            <Checks
              name="exclusion_statut_pro"
              options={Object.entries(MEP_VALUE_LABELS.statut_pro ?? {})}
              selected={c.exclusions?.statut_pro ?? []}
            />
          </Field>
          <Field
            label="Critères OBLIGATOIRES pour router"
            hint="Les autres pondèrent seulement. Aucun coché = tout lead est routable."
          >
            <Checks name="obligatoires" options={CRITERIA} selected={c.obligatoires} />
          </Field>
        </div>
      </div>

      <div className="card">
        <div className="card-head">Volumes, prix, validation</div>
        <div className="card-body form-grid">
          <Field label="Plafond par jour">
            <Input name="dailyCap" type="number" min={1} defaultValue={buyer?.dailyCap ?? ''} />
          </Field>
          <Field label="Plafond par semaine">
            <Input name="weeklyCap" type="number" min={1} defaultValue={buyer?.weeklyCap ?? ''} />
          </Field>
          <Field label="Priorité (1 = servi en premier)">
            <Input name="priority" type="number" min={1} defaultValue={buyer?.priority ?? 1} />
          </Field>
          <Field label="Prix par RDV conforme (€)">
            <Input
              name="pricePerRdv"
              type="number"
              min={0}
              step="0.01"
              defaultValue={buyer ? buyer.pricePerRdvCents / 100 : ''}
            />
          </Field>
          <Field
            label="Valeur estimée d’une signature (€)"
            hint="Envoyée à Meta sur l’événement Signe."
          >
            <Input
              name="signedValue"
              type="number"
              min={0}
              step="0.01"
              defaultValue={buyer?.signedValueCents ? buyer.signedValueCents / 100 : ''}
            />
          </Field>
          <Field label="Délai de validation (heures)">
            <Input
              name="validationDelayHours"
              type="number"
              min={1}
              defaultValue={buyer?.validationDelayHours ?? 48}
            />
          </Field>
          <Field label="Validation tacite" hint="Désactivée pendant le premier pack.">
            <label className="row" style={{ gap: 8, height: 40 }}>
              <input
                type="checkbox"
                className="checkbox"
                name="tacitValidationEnabled"
                defaultChecked={buyer?.tacitValidationEnabled ?? false}
              />{' '}
              Activer
            </label>
          </Field>
          <Field label="Actif">
            <label className="row" style={{ gap: 8, height: 40 }}>
              <input
                type="checkbox"
                className="checkbox"
                name="active"
                defaultChecked={buyer?.active ?? true}
              />{' '}
              Reçoit des rendez-vous
            </label>
          </Field>
        </div>
      </div>

      <div className="card">
        <div className="card-head">Agenda</div>
        <div className="card-body form-grid">
          <Field label="Mode">
            <Select
              name="calendarProvider"
              defaultValue={buyer?.calendarProvider ?? 'calendly_link'}
            >
              <option value="calendly_link">Lien de réservation (Calendly ou autre)</option>
              <option value="calendly_oauth">Calendly connecté (OAuth, v1)</option>
              <option value="manual">Saisie manuelle</option>
            </Select>
          </Field>
          <Field label="Lien de réservation" hint="Affiché au setter pendant l’appel.">
            <Input
              name="bookingUrl"
              type="url"
              defaultValue={buyer?.calendarConfig?.booking_url ?? ''}
              placeholder="https://calendly.com/…"
            />
          </Field>
          <Field label="Durée d’un rendez-vous (min)">
            <Input
              name="durationMin"
              type="number"
              min={10}
              defaultValue={buyer?.calendarConfig?.duration_min ?? 30}
            />
          </Field>
          <Field label="Fuseau">
            <Input name="timezone" defaultValue={buyer?.timezone ?? 'Europe/Paris'} />
          </Field>
        </div>
      </div>

      {state?.error ? <p className="error">{state.error}</p> : null}
      {state?.ok ? <p className="notice">{state.ok}</p> : null}
      <div className="form-actions">
        <Submit label={submitLabel} />
      </div>
    </form>
  );
}
