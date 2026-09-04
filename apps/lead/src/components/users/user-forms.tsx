'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createStaffUserAction,
  type FormState,
  updatePrefsAction,
  updateScopeAction,
} from '@/app/(app)/utilisateurs/actions';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import type { users } from '@/lib/db/schema';

type UserRow = typeof users.$inferSelect;
type SourceOpt = { id: string; name: string };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? '…' : label}
    </Button>
  );
}

export function CreateStaffForm({ sources }: { sources: SourceOpt[] }) {
  const [state, action] = useActionState<FormState, FormData>(createStaffUserAction, null);
  return (
    <form action={action} className="card">
      <div className="card-head">Nouveau compte interne</div>
      <div className="card-body stack" style={{ gap: 14 }}>
        <div className="form-grid">
          <Field label="Email">
            <Input name="email" type="email" required />
          </Field>
          <Field label="Mot de passe (10 caractères min.)">
            <Input
              name="password"
              type="password"
              minLength={10}
              required
              autoComplete="new-password"
            />
          </Field>
          <Field label="Nom">
            <Input name="name" />
          </Field>
          <Field label="Rôle">
            <Select name="role" defaultValue="setter">
              <option value="setter">Setter</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
        </div>
        <Field label="Sources (setter)">
          <div className="row" style={{ gap: 12 }}>
            {sources.map((s) => (
              <label key={s.id} className="row" style={{ gap: 6, fontSize: 14 }}>
                <input
                  type="checkbox"
                  className="checkbox"
                  name="sourceIds"
                  value={s.id}
                  defaultChecked
                />{' '}
                {s.name}
              </label>
            ))}
          </div>
        </Field>
        {state?.error ? <p className="error">{state.error}</p> : null}
        {state?.ok ? <p className="notice">{state.ok}</p> : null}
        <div className="form-actions">
          <Submit label="Créer le compte" />
        </div>
      </div>
    </form>
  );
}

export function PrefsForm({ user }: { user: UserRow }) {
  const [state, action] = useActionState<FormState, FormData>(
    updatePrefsAction.bind(null, user.id),
    null,
  );
  return (
    <form action={action} className="card">
      <div className="card-head">Alertes</div>
      <div className="card-body stack" style={{ gap: 14 }}>
        <Field
          label="Identifiant Telegram (chat id)"
          hint="Démarrez une conversation avec le bot, puis récupérez votre identifiant auprès de @userinfobot."
        >
          <Input
            name="telegramChatId"
            defaultValue={user.telegramChatId ?? ''}
            placeholder="123456789"
          />
        </Field>
        <Field label="Téléphone pour les alertes (SMS, plus tard)">
          <Input name="phoneForAlerts" defaultValue={user.phoneForAlerts ?? ''} />
        </Field>
        <label className="row" style={{ gap: 8, fontSize: 14 }}>
          <input type="checkbox" className="checkbox" name="onDuty" defaultChecked={user.onDuty} />{' '}
          De garde : je reçois les nouveaux leads et les escalades
        </label>
        {state?.error ? <p className="error">{state.error}</p> : null}
        {state?.ok ? <p className="notice">{state.ok}</p> : null}
        <div className="form-actions">
          <Submit label="Enregistrer" />
        </div>
      </div>
    </form>
  );
}

export function ScopeForm({ user, sources }: { user: UserRow; sources: SourceOpt[] }) {
  const [state, action] = useActionState<FormState, FormData>(
    updateScopeAction.bind(null, user.id),
    null,
  );
  return (
    <form action={action} className="card">
      <div className="card-head">Rôle et périmètre</div>
      <div className="card-body stack" style={{ gap: 14 }}>
        <Field label="Rôle">
          <Select name="role" defaultValue={user.role === 'admin' ? 'admin' : 'setter'}>
            <option value="setter">Setter</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        <Field label="Sources (setter)">
          <div className="row" style={{ gap: 12 }}>
            {sources.map((s) => (
              <label key={s.id} className="row" style={{ gap: 6, fontSize: 14 }}>
                <input
                  type="checkbox"
                  className="checkbox"
                  name="sourceIds"
                  value={s.id}
                  defaultChecked={user.sourceIds.includes(s.id)}
                />{' '}
                {s.name}
              </label>
            ))}
          </div>
        </Field>
        <label className="row" style={{ gap: 8, fontSize: 14 }}>
          <input type="checkbox" className="checkbox" name="active" defaultChecked={user.active} />{' '}
          Compte actif
        </label>
        {state?.error ? <p className="error">{state.error}</p> : null}
        {state?.ok ? <p className="notice">{state.ok}</p> : null}
        <div className="form-actions">
          <Submit label="Enregistrer" />
        </div>
      </div>
    </form>
  );
}
