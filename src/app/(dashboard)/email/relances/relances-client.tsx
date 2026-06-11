'use client';

import { Check, Clock, Mail, RotateCw, Send, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import type { RelanceCandidate, RelanceType } from '@/lib/closing/relances';
import {
  approveAndSendRelanceAction,
  generateRelanceEmailAction,
  type RelanceDraft,
} from './actions';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function money(n: number | null): string {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

type Editing = {
  investorId: string;
  type: RelanceType;
  draft: RelanceDraft;
  amfIssues: { match: string; suggestedFix: string }[];
} | null;

export function RelancesClient({
  rebound,
  dormant,
  testMode,
}: {
  rebound: RelanceCandidate[];
  dormant: RelanceCandidate[];
  testMode: boolean;
}) {
  const { toast, runWithActivity } = useToast();
  const [tab, setTab] = useState<RelanceType>('rebound');
  const [editing, setEditing] = useState<Editing>(null);
  const [sent, setSent] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const list = tab === 'rebound' ? rebound : dormant;
  const visible = list.filter((c) => !sent.has(c.investorId));

  function generate(c: RelanceCandidate, type: RelanceType) {
    startTransition(async () => {
      const r = await runWithActivity('Le Pilote rédige l’email…', () =>
        generateRelanceEmailAction({
          investorId: c.investorId,
          type,
          reboundAmount: type === 'rebound' ? (c.reboundAmount ?? undefined) : undefined,
        }),
      );
      if (!r.ok) {
        toast(r.message, { variant: 'error' });
        return;
      }
      setEditing({ investorId: c.investorId, type, draft: r.draft, amfIssues: r.amf.issues });
    });
  }

  function approve() {
    if (!editing) return;
    const ed = editing;
    startTransition(async () => {
      const r = await runWithActivity('Envoi en cours…', () =>
        approveAndSendRelanceAction({
          investorId: ed.investorId,
          type: ed.type,
          subject: ed.draft.subject,
          preheader: ed.draft.preheader,
          body: ed.draft.body,
        }),
      );
      if (!r.ok) {
        if ('amf' in r) {
          toast(`Bloqué (AMF) : ${r.amf.map((i) => i.match).join(', ')}`, { variant: 'error' });
        } else {
          toast(r.message, { variant: 'error' });
        }
        return;
      }
      setSent((prev) => new Set(prev).add(ed.investorId));
      setEditing(null);
      toast(
        r.testMode
          ? `Mode test : envoyé à ton adresse de test (pas à l’investisseur).`
          : `Email envoyé à ${r.sentTo}.`,
        { variant: 'success' },
      );
    });
  }

  function patch(field: keyof RelanceDraft, value: string) {
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, [field]: value } } : e));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Onglets */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'rebound' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => {
            setTab('rebound');
            setEditing(null);
          }}
        >
          Rebond ({rebound.filter((c) => !sent.has(c.investorId)).length})
        </button>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'dormant' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => {
            setTab('dormant');
            setEditing(null);
          }}
        >
          Endormis ({dormant.filter((c) => !sent.has(c.investorId)).length})
        </button>
      </div>

      {testMode && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'var(--warning)',
            background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
            borderRadius: 8,
            padding: '8px 10px',
          }}
        >
          <Mail size={14} /> MODE TEST actif : « Approuver & envoyer » enverra l'email à ton adresse
          de test, jamais au vrai investisseur.
        </div>
      )}

      {visible.length === 0 ? (
        <div className="view-card">
          <div className="view-card-body" style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {tab === 'rebound'
              ? 'Aucun capital à relancer pour le moment (remboursements à venir dans 45 jours).'
              : 'Aucun investisseur endormi à relancer pour le moment.'}
          </div>
        </div>
      ) : (
        visible.map((c) => (
          <div key={c.investorId} className="view-card">
            <div
              className="view-card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                    {c.fullName || c.firstName}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {c.email}
                    {tab === 'rebound'
                      ? ` · ${money(c.reboundAmount)} remboursés le ${fmtDate(c.repaymentDate)}`
                      : ` · onboardé · ${money(c.totalInvested)} investis`}
                  </div>
                </div>
                {editing?.investorId !== c.investorId && (
                  <button
                    type="button"
                    className="btn btn-sm btn-ai"
                    disabled={pending}
                    onClick={() => generate(c, tab)}
                  >
                    <Mail size={13} />
                    Préparer l'email
                  </button>
                )}
              </div>

              {/* Éditeur de relecture/validation */}
              {editing?.investorId === c.investorId && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    borderTop: '1px solid var(--border)',
                    paddingTop: 12,
                  }}
                >
                  {editing.amfIssues.length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--danger)' }}>
                      Vérif AMF : {editing.amfIssues.map((i) => i.match).join(', ')} (« non garanti
                      » peut être un faux positif).
                    </div>
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
                    Objet
                    <input
                      className="input"
                      value={editing.draft.subject}
                      onChange={(e) => patch('subject', e.target.value)}
                    />
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      fontSize: 11,
                      color: 'var(--text-3)',
                    }}
                  >
                    Aperçu (préheader)
                    <input
                      className="input"
                      value={editing.draft.preheader}
                      onChange={(e) => patch('preheader', e.target.value)}
                    />
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      fontSize: 11,
                      color: 'var(--text-3)',
                    }}
                  >
                    Message
                    <textarea
                      className="input"
                      rows={9}
                      value={editing.draft.body}
                      onChange={(e) => patch('body', e.target.value)}
                      style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={pending}
                      onClick={approve}
                    >
                      <Send size={13} />
                      Approuver & envoyer
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      disabled={pending}
                      onClick={() => generate(c, tab)}
                    >
                      <RotateCw size={13} />
                      Régénérer
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      disabled={pending}
                      onClick={() => setEditing(null)}
                    >
                      <X size={13} />
                      Fermer
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: 'var(--text-4)',
        }}
      >
        {sent.size > 0 ? (
          <>
            <Check size={13} style={{ color: 'var(--success)' }} /> {sent.size} relance(s)
            envoyée(s) cette session.
          </>
        ) : (
          <>
            <Clock size={13} /> Rien n'est envoyé sans ton clic « Approuver & envoyer ».
          </>
        )}
      </div>
    </div>
  );
}
