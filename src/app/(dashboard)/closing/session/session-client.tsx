'use client';

import {
  ArrowRight,
  Copy,
  Flame,
  Hourglass,
  PhoneCall,
  PhoneOff,
  Sparkles,
  Target,
  UserX,
  Voicemail,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import type { CallBrief } from '@/lib/ai/call-brief';
import {
  draftCallBriefAction,
  markCalledAction,
  qualifyCallAction,
} from '../investor/[id]/actions';

export type SessionLead = {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  isBreach: boolean;
  totalInvested: number;
  priority: number;
  temperature: 'hot' | 'warm' | 'cold';
  temperatureLabel: string;
  statusLabel: string;
  queueLabel: string;
  callGoal: string;
  factors: string[];
};

type Outcome =
  | 'reached'
  | 'no_answer'
  | 'voicemail'
  | 'wrong_number'
  | 'in_progress'
  | 'profile_incompatible';

const OUTCOMES: { key: Outcome; label: string; icon: typeof PhoneCall; color: string }[] = [
  { key: 'reached', label: 'Joint', icon: PhoneCall, color: 'var(--success)' },
  { key: 'no_answer', label: 'Pas de réponse', icon: PhoneOff, color: 'var(--warning)' },
  { key: 'voicemail', label: 'Répondeur', icon: Voicemail, color: 'var(--text-3)' },
  { key: 'wrong_number', label: 'Faux numéro', icon: X, color: 'var(--danger)' },
  { key: 'in_progress', label: 'En cours', icon: Hourglass, color: 'var(--brand)' },
  {
    key: 'profile_incompatible',
    label: 'Profil incompatible',
    icon: UserX,
    color: 'var(--danger)',
  },
];

const STAGES: { value: string; label: string }[] = [
  { value: 'contacted', label: 'Contacté' },
  { value: 'meeting_booked', label: 'RDV pris' },
  { value: 'meeting_done', label: 'RDV fait' },
  { value: 'proposal_sent', label: 'Proposition envoyée' },
  { value: 'closed_won', label: 'Gagné 🎉' },
  { value: 'closed_lost', label: 'Perdu' },
];

const TEMP_COLOR: Record<SessionLead['temperature'], string> = {
  hot: 'var(--danger)',
  warm: 'var(--warning)',
  cold: 'var(--text-3)',
};

function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

export function SessionClient({ leads }: { leads: SessionLead[] }) {
  const { toast, runWithActivity } = useToast();
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(0);
  const [brief, setBrief] = useState<CallBrief | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState('');
  const [nextStage, setNextStage] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [pending, startTransition] = useTransition();

  const lead = leads[index];

  function reset() {
    setBrief(null);
    setOutcome(null);
    setNote('');
    setNextStage('');
    setCallbackAt('');
  }

  function next() {
    reset();
    setIndex((i) => i + 1);
  }

  function generateBrief() {
    if (!lead) return;
    startTransition(async () => {
      const r = await runWithActivity('Le Pilote prépare le brief…', () =>
        draftCallBriefAction(lead.id),
      );
      if (!r.ok) {
        toast(r.message, { variant: 'error' });
        return;
      }
      setBrief(r.brief);
    });
  }

  function save() {
    if (!lead || !outcome) return;
    const current = lead;
    const chosen = outcome;
    startTransition(async () => {
      const ok = await runWithActivity('Enregistrement de l’appel…', async () => {
        const called = await markCalledAction({ investorId: current.id });
        if (!called.ok) {
          toast(called.message, { variant: 'error' });
          return false;
        }
        const q = await qualifyCallAction({
          callId: called.interactionId,
          outcome: chosen,
          note: note.trim() || undefined,
          nextStage: chosen === 'reached' && nextStage ? nextStage : undefined,
          callbackAt: callbackAt ? new Date(callbackAt).toISOString() : undefined,
        });
        if (!q.ok) {
          toast(q.message, { variant: 'error' });
          return false;
        }
        return true;
      });
      if (ok) {
        setDone((d) => d + 1);
        toast('Appel enregistré.', { variant: 'success', duration: 2500 });
        next();
      }
    });
  }

  // Fin de session
  if (!lead) {
    return (
      <div className="view-card" style={{ maxWidth: 520, margin: '40px auto', width: '100%' }}>
        <div
          className="view-card-body"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            textAlign: 'center',
            padding: '36px 28px',
          }}
        >
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'var(--success-bg)',
              color: 'var(--success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Target size={20} />
          </span>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>
            Session terminée
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {done} appel(s) enregistré(s) sur {leads.length} lead(s).
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/closing/queue" className="btn btn-secondary">
              Retour à la file
            </Link>
            <Link href="/closing/suivi" className="btn btn-primary">
              Voir le suivi
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      {/* Progression */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 12,
        }}
      >
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Appel <strong style={{ color: 'var(--text-1)' }}>{index + 1}</strong> / {leads.length}
          {done > 0 ? ` · ${done} enregistré(s)` : ''}
        </div>
        <Link href="/closing/queue" className="btn btn-ghost btn-sm">
          <X size={13} />
          Quitter
        </Link>
      </div>

      <div className="view-card">
        <div
          className="view-card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          {/* Identité + priorité */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>
                  {lead.fullName || lead.email}
                </span>
                {lead.isBreach && <span className="badge badge-ai">BREACH</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {lead.statusLabel}
                {lead.city ? ` · ${lead.city}` : ''}
                {lead.totalInvested > 0 ? ` · ${money(lead.totalInvested)} investis` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 12,
                  fontWeight: 600,
                  color: TEMP_COLOR[lead.temperature],
                }}
              >
                <Flame size={13} />
                {lead.temperatureLabel} · {lead.priority}/100
              </div>
            </div>
          </div>

          {/* Objectif d'appel + facteurs */}
          <div
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text-4)', textTransform: 'uppercase' }}>
              {lead.queueLabel}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500, marginTop: 2 }}>
              {lead.callGoal}
            </div>
            {lead.factors.length > 0 && (
              <ul
                style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 12, color: 'var(--text-3)' }}
              >
                {lead.factors.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Téléphone */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {lead.phone ? (
              <>
                <a href={`tel:${lead.phone}`} className="btn btn-primary">
                  <PhoneCall size={15} />
                  Appeler {lead.phone}
                </a>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(lead.phone ?? '')
                      .then(() => toast('Numéro copié.', { variant: 'success', duration: 2000 }))
                  }
                >
                  <Copy size={13} />
                  Copier
                </button>
              </>
            ) : (
              <span style={{ fontSize: 13, color: 'var(--text-4)' }}>Aucun numéro renseigné.</span>
            )}
            <Link
              href={`/closing/investor/${lead.id}`}
              target="_blank"
              className="btn btn-sm btn-ghost"
            >
              Fiche complète
            </Link>
          </div>

          {/* Brief IA */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            {brief ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-4)' }}>Accroche</span>
                  <div style={{ color: 'var(--text-1)', fontWeight: 500 }}>{brief.accroche}</div>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-4)' }}>Objectif</span>
                  <div style={{ color: 'var(--text-2)' }}>{brief.objectif}</div>
                </div>
                {brief.points.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--text-2)' }}>
                    {brief.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
                {brief.objections.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {brief.objections.map((o) => (
                      <div key={o.objection} style={{ marginTop: 4 }}>
                        <strong>« {o.objection} »</strong> → {o.reponse}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-ai"
                onClick={generateBrief}
                disabled={pending}
              >
                <Sparkles size={13} />
                Brief IA avant l'appel
              </button>
            )}
          </div>

          {/* Résultat de l'appel */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-4)',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Résultat de l'appel
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {OUTCOMES.map((o) => {
                const Icon = o.icon;
                const active = outcome === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setOutcome(o.key)}
                    style={active ? undefined : { color: o.color }}
                  >
                    <Icon size={13} />
                    {o.label}
                  </button>
                );
              })}
            </div>

            {outcome && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {outcome === 'reached' && (
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      fontSize: 11,
                      color: 'var(--text-3)',
                    }}
                  >
                    Nouvelle étape (optionnel)
                    <select
                      className="input"
                      value={nextStage}
                      onChange={(e) => setNextStage(e.target.value)}
                    >
                      <option value="">— inchangée —</option>
                      {STAGES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {(outcome === 'no_answer' ||
                  outcome === 'voicemail' ||
                  outcome === 'in_progress') && (
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      fontSize: 11,
                      color: 'var(--text-3)',
                    }}
                  >
                    Programmer un rappel (optionnel)
                    <input
                      type="datetime-local"
                      className="input"
                      value={callbackAt}
                      onChange={(e) => setCallbackAt(e.target.value)}
                    />
                  </label>
                )}
                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    fontSize: 11,
                    color: 'var(--text-3)',
                  }}
                >
                  Note (optionnel)
                  <textarea
                    className="input"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ce qui s'est dit, prochaine action…"
                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </label>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={save}
                disabled={pending || !outcome}
              >
                Enregistrer & suivant
                <ArrowRight size={14} />
              </button>
              <button type="button" className="btn btn-ghost" onClick={next} disabled={pending}>
                Passer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
