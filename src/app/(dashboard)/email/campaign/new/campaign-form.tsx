'use client';

import { Check, Send } from 'lucide-react';
import { useState, useTransition } from 'react';
import { type CampaignResult, createCampaignAction, sendCampaignAction } from '../actions';

type ListOption = { id: number; name: string; subscribers: number };

type Created = { campaignId: number };

export function CampaignForm({ lists, testMode }: { lists: ListOption[]; testMode: boolean }) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [listId, setListId] = useState<number | ''>('');
  const [bodyText, setBodyText] = useState('');
  const [result, setResult] = useState<CampaignResult | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [sent, setSent] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setResult(null);
    setSent(null);
    startTransition(async () => {
      const res = await createCampaignAction({
        name: name.trim(),
        subject: subject.trim(),
        bodyText,
        listId: listId === '' ? (undefined as unknown as number) : listId,
      });
      setResult(res);
      if (res.ok) setCreated({ campaignId: res.campaignId });
    });
  }

  function sendNow() {
    if (!created) return;
    setSent(null);
    startTransition(async () => {
      const res = await sendCampaignAction(created.campaignId);
      setSent({ ok: res.ok, text: res.ok ? 'Campagne envoyée.' : res.message });
    });
  }

  if (created) {
    return (
      <div
        className="view-card"
        style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--success)' }}>
          <Check size={18} />
          <strong>Brouillon créé dans Brevo (campagne #{created.campaignId})</strong>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
          La campagne est enregistrée en <strong>brouillon</strong> — aucun email n'a encore été
          envoyé.
        </p>

        {testMode ? (
          <p
            style={{
              fontSize: 12,
              color: 'var(--warning)',
              margin: 0,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'color-mix(in srgb, var(--warning) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--warning) 24%, transparent)',
            }}
          >
            🔒 Mode test actif : l'envoi réel est bloqué. Désactive EMAIL_TEST_MODE pour pouvoir
            envoyer à la liste.
          </p>
        ) : (
          <button type="button" className="btn btn-primary" onClick={sendNow} disabled={pending}>
            <Send size={14} />
            {pending ? 'Envoi…' : 'Envoyer maintenant à la liste'}
          </button>
        )}

        {sent && (
          <p
            style={{ fontSize: 12, margin: 0, color: sent.ok ? 'var(--success)' : 'var(--danger)' }}
          >
            {sent.text}
          </p>
        )}

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            setCreated(null);
            setName('');
            setSubject('');
            setBodyText('');
            setListId('');
            setResult(null);
            setSent(null);
          }}
        >
          Nouvelle campagne
        </button>
      </div>
    );
  }

  return (
    <div
      className="view-card"
      style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div className="form-field">
        <label className="form-label" htmlFor="c-name">
          Nom de la campagne (interne)
        </label>
        <input
          id="c-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Relance projets juin"
        />
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="c-subject">
          Objet de l'email
        </label>
        <input
          id="c-subject"
          className="input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="c-list">
          Liste destinataire
        </label>
        <select
          id="c-list"
          className="select"
          value={listId}
          onChange={(e) => setListId(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">Choisir une liste…</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.subscribers.toLocaleString('fr-FR')})
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="c-body">
          Message
        </label>
        <textarea
          id="c-body"
          className="textarea"
          rows={10}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
        />
      </div>

      {result && !result.ok && result.reason === 'amf' && (
        <div
          role="alert"
          style={{
            fontSize: 12,
            color: 'var(--danger)',
            padding: '10px 12px',
            borderRadius: 8,
            background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--danger) 24%, transparent)',
          }}
        >
          <strong>Bloqué par le scan AMF :</strong>{' '}
          {result.issues.map((i) => `« ${i.match} » → ${i.suggestedFix}`).join(' · ')}
        </div>
      )}
      {result && !result.ok && result.reason === 'error' && (
        <p role="alert" style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>
          {result.message}
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary"
        onClick={create}
        disabled={pending || !name.trim() || !subject.trim() || !bodyText.trim() || listId === ''}
        style={{ alignSelf: 'flex-start' }}
      >
        {pending ? 'Création…' : 'Créer le brouillon (scan AMF)'}
      </button>
    </div>
  );
}
