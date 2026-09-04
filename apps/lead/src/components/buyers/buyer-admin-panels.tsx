'use client';

import { useActionState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createPackAction,
  type FormState,
  inviteBuyerUserAction,
  pauseBuyerAction,
  removeBuyerUserAction,
} from '@/app/(app)/acheteurs/actions';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import type { buyerUsers, packs } from '@/lib/db/schema';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? '…' : label}
    </Button>
  );
}

export function InvitePanel({
  buyerId,
  users,
}: {
  buyerId: string;
  users: (typeof buyerUsers.$inferSelect)[];
}) {
  const [state, action] = useActionState<FormState, FormData>(
    inviteBuyerUserAction.bind(null, buyerId),
    null,
  );
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <div className="card">
      <div className="card-head">Accès au portail acheteur</div>
      <div className="card-body stack" style={{ gap: 14 }}>
        {users.length ? (
          <ul
            className="stack"
            style={{ gap: 6, listStyle: 'none', padding: 0, margin: 0, fontSize: 14 }}
          >
            {users.map((u) => (
              <li key={u.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span>
                  {u.email}{' '}
                  <span className="hint">
                    · {u.role}
                    {u.lastLoginAt
                      ? ` · dernière connexion ${u.lastLoginAt.toLocaleDateString('fr-FR')}`
                      : ' · jamais connecté'}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await removeBuyerUserAction(buyerId, u.email);
                      toast.push(r?.ok ?? r?.error ?? '', r?.error ? 'error' : 'ok');
                    })
                  }
                >
                  Retirer
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">
            Personne n’a encore accès. L’acheteur se connecte par lien magique (sans mot de passe).
          </p>
        )}
        <form action={action} className="row" style={{ alignItems: 'flex-end', gap: 10 }}>
          <Field label="Inviter un email">
            <Input name="email" type="email" required placeholder="cabinet@exemple.fr" />
          </Field>
          <Submit label="Inviter" />
        </form>
        {state?.error ? <p className="error">{state.error}</p> : null}
        {state?.ok ? <p className="notice">{state.ok}</p> : null}
      </div>
    </div>
  );
}

export function PackPanel({
  buyerId,
  packs: rows,
  defaultPriceCents,
}: {
  buyerId: string;
  packs: (typeof packs.$inferSelect)[];
  defaultPriceCents: number;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    createPackAction.bind(null, buyerId),
    null,
  );
  return (
    <div className="card">
      <div className="card-head">Packs de rendez-vous</div>
      <div className="card-body stack" style={{ gap: 14 }}>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Créé</th>
                <th>Taille</th>
                <th>Restants</th>
                <th>Prix / RDV</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="num">{p.createdAt.toLocaleDateString('fr-FR')}</td>
                  <td className="num">{p.size}</td>
                  <td className="num">{p.remaining}</td>
                  <td className="num">
                    {p.isPilot
                      ? 'offert'
                      : `${(p.priceCentsPerRdv / 100).toLocaleString('fr-FR')} €`}
                  </td>
                  <td>
                    {p.status}
                    {p.isPilot ? ' · pilote' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="hint">Aucun pack. Sans pack prépayé, l’acheteur est facturé au mois.</p>
        )}
        <form
          action={action}
          className="row"
          style={{ alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}
        >
          <Field label="Taille">
            <Input name="size" type="number" min={1} defaultValue={10} style={{ width: 90 }} />
          </Field>
          <Field label="Prix / RDV (€)">
            <Input
              name="pricePerRdv"
              type="number"
              min={0}
              step="0.01"
              defaultValue={defaultPriceCents / 100}
              style={{ width: 120 }}
            />
          </Field>
          <label className="row" style={{ gap: 6, height: 40, fontSize: 14 }}>
            <input type="checkbox" className="checkbox" name="isPilot" /> Pack pilote (offert)
          </label>
          <label className="row" style={{ gap: 6, height: 40, fontSize: 14 }}>
            <input type="checkbox" className="checkbox" name="prepaid" /> Prépayé
          </label>
          <Submit label="Créer le pack" />
        </form>
        {state?.error ? <p className="error">{state.error}</p> : null}
        {state?.ok ? <p className="notice">{state.ok}</p> : null}
      </div>
    </div>
  );
}

export function PausePanel({
  buyerId,
  pausedUntil,
}: {
  buyerId: string;
  pausedUntil: Date | null;
}) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const paused = pausedUntil !== null && pausedUntil > new Date();
  const act = (days: number) =>
    start(async () => {
      const r = await pauseBuyerAction(buyerId, days);
      toast.push(r?.ok ?? r?.error ?? '', r?.error ? 'error' : 'ok');
    });
  return (
    <div className="card">
      <div className="card-head">Pause</div>
      <div className="card-body row" style={{ gap: 8 }}>
        {paused ? (
          <>
            <span className="hint">
              En pause jusqu’au {pausedUntil?.toLocaleDateString('fr-FR')}.
            </span>
            <Button size="sm" disabled={pending} onClick={() => act(0)}>
              Lever la pause
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" disabled={pending} onClick={() => act(1)}>
              1 jour
            </Button>
            <Button size="sm" disabled={pending} onClick={() => act(7)}>
              1 semaine
            </Button>
            <Button size="sm" disabled={pending} onClick={() => act(30)}>
              1 mois
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
