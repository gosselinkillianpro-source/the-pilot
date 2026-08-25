'use client';

import { CheckCircle2, ChevronDown, Phone, Radio } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import type { WebinarAttendee } from '@/lib/db/queries/webinars';
import { formatDuration, parseCapacity, totalWatchedS } from '@/lib/webinars/call-order';
import { claimWebinarContact, logWebinarCall, scheduleWebinarCallback } from '../actions';

/**
 * Une ligne d'inscrit, dépliable.
 *
 * Repliée : l'essentiel pour décider d'appeler — nom, capacité, engagement.
 * Dépliée : le questionnaire, le contexte SAH et les actions de suivi.
 * Le closer ne quitte jamais la page.
 */

const OUTCOMES: { value: string; label: string }[] = [
  { value: 'reached', label: 'Joint' },
  { value: 'no_answer', label: 'Pas de réponse' },
  { value: 'voicemail', label: 'Répondeur' },
  { value: 'callback_scheduled', label: 'Rappel programmé' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'profile_incompatible', label: 'Profil incompatible' },
  { value: 'wrong_number', label: 'Mauvais numéro' },
];

function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export function AttendeeRow({
  attendee,
  webinarId,
  webinarDurationS,
  rank,
}: {
  attendee: WebinarAttendee;
  webinarId: string;
  webinarDurationS: number | null;
  rank: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  const capacity = parseCapacity(attendee.extraFields?.["Capacité d'inscription"]);
  const availability = attendee.extraFields?.['Disponibilité des fonds sous 30 jours'] ?? null;
  const watched = totalWatchedS(attendee);
  const pct =
    webinarDurationS && webinarDurationS > 0 && watched > 0
      ? Math.min(100, Math.round((watched / webinarDurationS) * 100))
      : null;

  const target = attendee.investorId
    ? { investorId: attendee.investorId }
    : { contactId: attendee.contactId };

  function run(fn: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.success) toast(ok, { variant: 'success' });
        else toast(res.error ?? 'Action impossible', { variant: 'error' });
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Erreur', { variant: 'error' });
      }
    });
  }

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      {/* --- Ligne repliée --- */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: '28px 1.6fr 1fr 0.9fr 0.9fr 30px',
          gap: 12,
          alignItems: 'center',
          padding: '12px 20px',
          background: 'transparent',
          border: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text-4)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {rank}
        </span>

        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-1)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {attendee.fullName ?? attendee.email}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
            {attendee.email}
            {attendee.investorId && (
              <span style={{ color: 'var(--success)', marginLeft: 6 }}>· compte SAH</span>
            )}
            {attendee.investedSinceWebinar > 0 && (
              <span style={{ color: 'var(--success)', fontWeight: 700, marginLeft: 6 }}>
                · a investi {Math.round(attendee.investedSinceWebinar).toLocaleString('fr-FR')} €
                depuis
              </span>
            )}
            {/* Le crédit du webinaire diffère de ce que la personne a investi
                depuis : un membre déjà présent n'apporte que sa première
                souscription. On affiche l'écart plutôt que de le taire. */}
            {attendee.investedSinceWebinar > attendee.attributedAmount && (
              <span style={{ color: 'var(--text-4)', marginLeft: 6 }}>
                ·{' '}
                {attendee.attributedAmount > 0
                  ? `${Math.round(attendee.attributedAmount).toLocaleString('fr-FR')} € attribués`
                  : 'rien attribué'}
              </span>
            )}
          </span>
        </span>

        <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={capacity.rank >= 4 ? 'badge badge-success' : 'badge badge-neutral'}>
            {capacity.label}
          </span>
          {availability === 'Oui' && <span className="badge badge-brand">fonds dispo</span>}
          {attendee.internalAccountReason ? (
            <span className="badge badge-neutral" title={attendee.internalAccountReason}>
              compte interne
            </span>
          ) : (
            attendee.attributionStatus === 'recruit' && (
              <span
                className="badge badge-brand"
                title="Compte Seven At Home ouvert grâce à ce webinaire"
              >
                recrue
              </span>
            )
          )}
        </span>

        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
          {attendee.watchedLive ? '🔴 direct' : attendee.watchedReplay ? '↺ replay' : '—'}
          {watched > 0 && (
            <span style={{ color: 'var(--text-4)' }}>
              {' '}
              {formatDuration(watched)}
              {pct != null ? ` · ${pct} %` : ''}
            </span>
          )}
        </span>

        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
          {attendee.lastCallAt ? `appelé ${fmtDate(attendee.lastCallAt)}` : 'jamais appelé'}
          {attendee.nextActionAt && (
            <span style={{ display: 'block', color: 'var(--brand)' }}>
              rappel {fmtDate(attendee.nextActionAt)}
            </span>
          )}
        </span>

        <ChevronDown
          size={15}
          style={{
            color: 'var(--text-4)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform .15s',
          }}
        />
      </button>

      {/* --- Détail déplié --- */}
      {open && (
        <div
          style={{
            padding: '4px 20px 18px 60px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {/* Questionnaire d'inscription */}
          {attendee.extraFields && Object.keys(attendee.extraFields).length > 0 && (
            <div>
              <Label>Questionnaire d'inscription</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {Object.entries(attendee.extraFields).map(([k, v]) => (
                  <div key={k} style={{ fontSize: 12.5 }}>
                    <span style={{ color: 'var(--text-3)' }}>{k} : </span>
                    <strong style={{ color: 'var(--text-1)' }}>{String(v)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contexte SAH */}
          {attendee.investorId ? (
            <div>
              <Label>Compte Seven At Home</Label>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                {attendee.sahOnboardingComplete
                  ? 'Onboardé (KYC validé)'
                  : attendee.sahRegistrationComplete
                    ? 'Profil complété'
                    : 'Inscrit, profil à compléter'}
                {attendee.totalInvested != null && attendee.totalInvested > 0 && (
                  <>
                    {' · déjà investi '}
                    <strong>{Math.round(attendee.totalInvested).toLocaleString('fr-FR')} €</strong>
                  </>
                )}
                {attendee.assignedCloserName && ` · suivi par ${attendee.assignedCloserName}`}
              </div>
              {/* La règle d'attribution en une phrase, sur la fiche concernée :
                  un closer doit pouvoir vérifier le chiffre sans lire le code. */}
              <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 4 }}>
                {attendee.internalAccountReason
                  ? `Compte interne (${attendee.internalAccountReason}) — exclu de la collecte attribuée.`
                  : attendee.attributionStatus === 'recruit'
                    ? 'Entré sur Seven At Home par ce webinaire : toutes ses souscriptions lui sont attribuées.'
                    : attendee.attributionStatus === 'recruited_elsewhere'
                      ? 'Entré sur Seven At Home par un autre webinaire, qui garde le crédit de ses souscriptions.'
                      : 'Membre avant ce webinaire : seule sa première souscription après le live est attribuée.'}
              </div>
              <Link
                href={`/closing/investor/${attendee.investorId}`}
                style={{ fontSize: 12, color: 'var(--brand)' }}
              >
                Ouvrir la fiche complète →
              </Link>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
              Pas encore de compte Seven At Home. Le rattachement se fera tout seul s'il s'inscrit.
            </div>
          )}

          {attendee.notes && (
            <div>
              <Label>Notes de l'équipe</Label>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>
                {attendee.notes}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {attendee.phone && (
              <a href={`tel:${attendee.phone}`} className="btn btn-primary btn-sm">
                <Phone size={13} />
                {attendee.phone}
              </a>
            )}

            <select
              className="input"
              style={{ fontSize: 12, padding: '5px 8px', maxWidth: 190 }}
              defaultValue=""
              disabled={pending}
              onChange={(e) => {
                const outcome = e.target.value;
                if (!outcome) return;
                e.target.value = '';
                run(
                  () => logWebinarCall({ ...target, webinarId, outcome: outcome as 'reached' }),
                  'Appel enregistré',
                );
              }}
            >
              <option value="">Enregistrer un appel…</option>
              {OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={pending}
              onClick={() => {
                const demain = new Date();
                demain.setDate(demain.getDate() + 1);
                demain.setHours(10, 0, 0, 0);
                run(
                  () =>
                    scheduleWebinarCallback({
                      ...target,
                      webinarId,
                      dueAt: demain.toISOString(),
                      note: 'Suite au webinaire',
                    }),
                  'Rappel programmé pour demain 10 h',
                );
              }}
            >
              <CheckCircle2 size={13} />
              Rappeler demain
            </button>

            {attendee.contactId && !attendee.investorId && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      claimWebinarContact({ webinarId, contactId: attendee.contactId as string }),
                    'Contact pris en charge',
                  )
                }
              >
                <Radio size={13} />
                Je m'en occupe
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-4)',
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}
