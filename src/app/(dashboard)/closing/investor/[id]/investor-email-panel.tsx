'use client';

import { AlertTriangle, Check, Mail, Send, Sparkles } from 'lucide-react';
import { useState, useTransition } from 'react';
import { sendEmailAction } from '@/app/(dashboard)/email/compose/actions';
import { draftProposalEmailAction } from './actions';

type AmfWarning = { match: string; suggestedFix: string };

type Draft = { subject: string; bodyText: string; costEur: number; amfWarnings: AmfWarning[] };

type SendState =
  | { kind: 'idle' }
  | { kind: 'sent'; testMode: boolean; sentTo: string }
  | { kind: 'amf'; issues: AmfWarning[] }
  | { kind: 'error'; message: string };

export function InvestorEmailPanel({
  investorId,
  firstName,
  email,
}: {
  investorId: string;
  firstName: string;
  email: string;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [genError, setGenError] = useState<string | null>(null);
  const [send, setSend] = useState<SendState>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();

  function generate() {
    setGenError(null);
    setSend({ kind: 'idle' });
    startTransition(async () => {
      const res = await draftProposalEmailAction(investorId);
      if (!res.ok) {
        setGenError(res.message);
        return;
      }
      setDraft({
        subject: res.subject,
        bodyText: res.bodyText,
        costEur: res.costEur,
        amfWarnings: res.amfWarnings,
      });
      setSubject(res.subject);
      setBodyText(res.bodyText);
    });
  }

  function sendEmail() {
    setSend({ kind: 'idle' });
    startTransition(async () => {
      const res = await sendEmailAction({
        mode: 'people',
        subject,
        bodyText,
        emails: [email],
        variant: 'personal',
      });
      if (res.ok) {
        setSend({ kind: 'sent', testMode: res.testMode, sentTo: res.sentTo });
      } else if (res.reason === 'amf') {
        setSend({ kind: 'amf', issues: res.issues });
      } else {
        setSend({ kind: 'error', message: res.message });
      }
    });
  }

  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={14} style={{ color: 'var(--ai)' }} />
          Email IA
        </div>
        {draft && (
          <span className="badge badge-neutral" title="Coût estimé de la génération">
            ~{draft.costEur.toFixed(3)}€
          </span>
        )}
      </div>

      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!draft ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, margin: 0 }}>
              Génère une proposition d'email personnalisée pour <strong>{firstName}</strong>, calée
              sur son score, sa situation et les projets ouverts. Tu pourras la relire et la
              modifier avant l'envoi.
            </p>
            <button
              type="button"
              className="btn btn-ai"
              onClick={generate}
              disabled={pending}
              style={{ alignSelf: 'flex-start' }}
            >
              <Sparkles />
              {pending ? 'Génération…' : 'Générer une proposition'}
            </button>
            {genError && (
              <p
                role="alert"
                style={{
                  fontSize: 12,
                  color: 'var(--danger)',
                  margin: 0,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--danger) 24%, transparent)',
                }}
              >
                {genError}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="form-field">
              <label className="form-label" htmlFor="ai-subject">
                Objet
              </label>
              <input
                id="ai-subject"
                className="input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="ai-body">
                Message
              </label>
              <textarea
                id="ai-body"
                className="textarea"
                value={bodyText}
                rows={10}
                onChange={(e) => setBodyText(e.target.value)}
              />
            </div>

            {draft.amfWarnings.length > 0 && (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--warning)',
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'color-mix(in srgb, var(--warning) 8%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--warning) 24%, transparent)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={13} />
                  Vigilance AMF
                </strong>
                {draft.amfWarnings.map((w) => (
                  <span key={w.match}>
                    « {w.match} » → {w.suggestedFix}
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={sendEmail}
                disabled={pending}
              >
                <Send />
                {pending ? 'Envoi…' : 'Relire et envoyer'}
              </button>
              <button type="button" className="btn btn-ai" onClick={generate} disabled={pending}>
                <Sparkles />
                Régénérer
              </button>
            </div>

            {send.kind === 'sent' && (
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--success)',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Check size={14} />
                {send.testMode
                  ? `Mode test : email envoyé à ${send.sentTo} (aucun vrai investisseur contacté).`
                  : `Email envoyé à ${send.sentTo}.`}
              </p>
            )}
            {send.kind === 'amf' && (
              <p
                role="alert"
                style={{
                  fontSize: 12,
                  color: 'var(--danger)',
                  margin: 0,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--danger) 24%, transparent)',
                }}
              >
                Envoi bloqué (AMF) : {send.issues.map((i) => i.match).join(', ')}. Corrige le
                message puis renvoie.
              </p>
            )}
            {send.kind === 'error' && (
              <p role="alert" style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>
                {send.message}
              </p>
            )}
          </>
        )}

        <p
          style={{
            fontSize: 11,
            color: 'var(--text-4)',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Mail size={11} />
          Destinataire : {email}
        </p>
      </div>
    </div>
  );
}
