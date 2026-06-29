'use client';

import { AlertTriangle, Check, Loader2, Mail, Send, Sparkles, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { sendEmailAction } from '@/app/(dashboard)/email/compose/actions';
import { useToast } from '@/components/shared/toast';
import type { EmailSender } from '@/lib/email/config';
import { deleteInvestorAssetAction, generateProposalAssetAction } from './actions';

type AmfWarning = { match: string; suggestedFix: string };

export type SavedEmail = {
  id: string;
  status: 'generating' | 'ready' | 'error';
  subject: string | null;
  preheader: string | null;
  body: string | null;
  costEur: string | null;
  amfWarnings: AmfWarning[];
  error: string | null;
};

type SendState =
  | { kind: 'idle' }
  | { kind: 'sent'; testMode: boolean; sentTo: string }
  | { kind: 'amf'; issues: AmfWarning[] }
  | { kind: 'error'; message: string };

function Header({ cost }: { cost: string | null }) {
  return (
    <div className="view-card-header">
      <div className="view-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Sparkles size={14} style={{ color: 'var(--ai)' }} />
        Email IA
      </div>
      {cost ? (
        <span className="badge badge-neutral" title="Coût estimé de la génération">
          ~{Number(cost).toFixed(3)}€
        </span>
      ) : null}
    </div>
  );
}

export function InvestorEmailPanel({
  investorId,
  firstName,
  email,
  saved,
  senders,
  defaultSender,
}: {
  investorId: string;
  firstName: string;
  email: string;
  saved: SavedEmail | null;
  senders: EmailSender[];
  defaultSender?: string;
}) {
  const router = useRouter();
  const { toast, runWithActivity } = useToast();
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState(saved?.subject ?? '');
  const [preheader, setPreheader] = useState(saved?.preheader ?? '');
  const [bodyText, setBodyText] = useState(saved?.body ?? '');
  const [senderAddress, setSenderAddress] = useState(defaultSender || senders[0]?.address || '');
  const [context, setContext] = useState('');
  const [send, setSend] = useState<SendState>({ kind: 'idle' });

  function generate() {
    startTransition(async () => {
      const res = await runWithActivity(`Génération de l'email — ${firstName}`, () =>
        generateProposalAssetAction({ investorId, closerContext: context.trim() || undefined }),
      );
      if (res.ok) {
        toast('Email généré et sauvegardé.', { variant: 'success' });
        router.refresh();
      } else {
        toast(res.message, { variant: 'error' });
      }
    });
  }

  function remove() {
    if (!saved) return;
    startTransition(async () => {
      const res = await deleteInvestorAssetAction({ assetId: saved.id });
      if (res.ok) {
        toast('Email supprimé.', { variant: 'info' });
        router.refresh();
      } else {
        toast(res.message, { variant: 'error' });
      }
    });
  }

  function sendEmail() {
    setSend({ kind: 'idle' });
    startTransition(async () => {
      const res = await runWithActivity(`Envoi de l'email — ${firstName}`, () =>
        sendEmailAction({
          mode: 'people',
          subject,
          preheader,
          bodyText,
          emails: [email],
          variant: 'personal',
          senderAddress: senderAddress || undefined,
        }),
      );
      if (res.ok) {
        setSend({ kind: 'sent', testMode: res.testMode, sentTo: res.sentTo });
        toast(res.testMode ? 'Email envoyé (mode test).' : 'Email envoyé.', { variant: 'success' });
      } else if (res.reason === 'amf') {
        setSend({ kind: 'amf', issues: res.issues });
        toast('Envoi bloqué (AMF) : corrige le message.', { variant: 'error' });
      } else {
        setSend({ kind: 'error', message: res.message });
        toast(res.message, { variant: 'error' });
      }
    });
  }

  // --- Aucun email encore généré ---
  if (!saved) {
    return (
      <div className="view-card">
        <Header cost={null} />
        <div
          className="view-card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, margin: 0 }}>
            Donne 1-2 phrases de contexte sur <strong>{firstName}</strong> (ce que tu sais, ce qui
            s'est dit), et l'IA rédige un email <strong>cordial, sérieux et chaleureux</strong>{' '}
            autour de ça. Laisse vide pour une proposition standard. L'email est sauvegardé sur la
            fiche.
          </p>
          <div className="form-field">
            <label className="form-label" htmlFor="ai-context">
              Contexte (ce que tu veux dire)
            </label>
            <textarea
              id="ai-context"
              className="textarea"
              rows={3}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Ex : on s'est appelés hier, il hésite entre 2 projets, il veut placer ~20k avant l'été et aimerait un point sur la sécurité des opérations."
            />
          </div>
          <button
            type="button"
            className="btn btn-ai"
            onClick={generate}
            disabled={pending}
            style={{ alignSelf: 'flex-start' }}
          >
            <Sparkles />
            {pending ? 'Génération…' : "Générer l'email"}
          </button>
        </div>
      </div>
    );
  }

  // --- Génération en cours (tourne en fond, même si tu quittes la page) ---
  if (saved.status === 'generating') {
    return (
      <div className="view-card">
        <Header cost={null} />
        <div
          className="view-card-body"
          style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-2)' }}
        >
          <Loader2 size={16} className="spin" style={{ color: 'var(--ai)' }} />
          <span style={{ fontSize: 13 }}>
            Génération de l'email en cours… (continue en fond, tu peux quitter la page)
          </span>
        </div>
      </div>
    );
  }

  // --- Erreur de génération ---
  if (saved.status === 'error') {
    return (
      <div className="view-card">
        <Header cost={null} />
        <div
          className="view-card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <p style={{ fontSize: 13, color: 'var(--danger)', margin: 0 }}>
            {saved.error ?? 'La génération a échoué.'}
          </p>
          <button
            type="button"
            className="btn btn-ai"
            onClick={generate}
            disabled={pending}
            style={{ alignSelf: 'flex-start' }}
          >
            <Sparkles />
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  // --- Email prêt : éditable + envoyer / régénérer / supprimer ---
  return (
    <div className="view-card">
      <Header cost={saved.costEur} />
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          <label className="form-label" htmlFor="ai-preheader">
            Aperçu (préheader)
          </label>
          <input
            id="ai-preheader"
            className="input"
            value={preheader}
            onChange={(e) => setPreheader(e.target.value)}
            placeholder="Texte affiché après l'objet dans la boîte de réception"
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

        {saved.amfWarnings.length > 0 && (
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
            {saved.amfWarnings.map((w) => (
              <span key={w.match}>
                « {w.match} » → {w.suggestedFix}
              </span>
            ))}
          </div>
        )}

        <div className="form-field">
          <label className="form-label" htmlFor="ai-context-regen">
            Affiner le contexte (puis « Régénérer »)
          </label>
          <textarea
            id="ai-context-regen"
            className="textarea"
            rows={2}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Ajoute/precise ce que tu veux dire, puis clique Régénérer."
          />
        </div>

        {senders.length > 1 && (
          <div className="form-field">
            <label className="form-label" htmlFor="ai-sender">
              Envoyer depuis
            </label>
            <select
              id="ai-sender"
              className="input"
              value={senderAddress}
              onChange={(e) => setSenderAddress(e.target.value)}
            >
              {senders.map((s) => (
                <option key={s.address} value={s.address}>
                  {s.name} — {s.address}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={sendEmail} disabled={pending}>
            <Send />
            {pending ? 'Envoi…' : 'Relire et envoyer'}
          </button>
          <button type="button" className="btn btn-ai" onClick={generate} disabled={pending}>
            <Sparkles />
            Régénérer
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={remove}
            disabled={pending}
            style={{ color: 'var(--danger)' }}
          >
            <Trash2 size={13} />
            Supprimer
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
          <p role="alert" style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>
            Envoi bloqué (AMF) : {send.issues.map((i) => i.match).join(', ')}. Corrige le message
            puis renvoie.
          </p>
        )}
        {send.kind === 'error' && (
          <p role="alert" style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>
            {send.message}
          </p>
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
