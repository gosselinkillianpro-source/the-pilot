'use client';

import { AlertTriangle, CheckCircle, List as ListIcon, Send, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { scanAmfCompliance } from '@/lib/ai/amf-compliance';
import type { EmailSender } from '@/lib/email/config';
import { renderEmailTemplate } from '@/lib/email/template';
import { type SendEmailResult, sendEmailAction } from './actions';

type BrevoListLite = { id: number; name: string; uniqueSubscribers: number };
type Mode = 'people' | 'list' | 'group';

function parseEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes('@'));
}

export function ComposeForm({
  lists,
  testMode,
  testAddress,
  senders,
}: {
  lists: BrevoListLite[];
  testMode: boolean;
  testAddress: string;
  senders: EmailSender[];
}) {
  const [mode, setMode] = useState<Mode>('people');
  const [senderAddress, setSenderAddress] = useState(senders[0]?.address ?? '');
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [peopleRaw, setPeopleRaw] = useState('');
  const [listId, setListId] = useState<number | null>(lists[0]?.id ?? null);
  const [groupName, setGroupName] = useState('');
  const [groupRaw, setGroupRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SendEmailResult | null>(null);

  const fullHtml = useMemo(
    () =>
      renderEmailTemplate({
        title,
        bodyText: body || ' ',
        ctaLabel,
        ctaUrl,
      }),
    [title, body, ctaLabel, ctaUrl],
  );

  const amf = useMemo(() => scanAmfCompliance(`${subject}\n${fullHtml}`), [subject, fullHtml]);

  const peopleEmails = parseEmails(peopleRaw);
  const groupEmails = parseEmails(groupRaw);
  const selectedList = lists.find((l) => l.id === listId);

  const recipientLabel =
    mode === 'people'
      ? `${peopleEmails.length} adresse(s)`
      : mode === 'list'
        ? `liste « ${selectedList?.name ?? '—'} » (${selectedList?.uniqueSubscribers ?? 0} contacts)`
        : `groupe « ${groupName || '—'} » (${groupEmails.length} contacts)`;

  async function handleSend() {
    setResult(null);
    setSubmitting(true);
    try {
      const res = await sendEmailAction({
        mode,
        subject,
        title: title || undefined,
        bodyText: body,
        ctaLabel: ctaLabel || undefined,
        ctaUrl: ctaUrl || undefined,
        emails: mode === 'people' ? peopleEmails : undefined,
        listId: mode === 'list' && listId ? listId : undefined,
        listName: mode === 'list' ? selectedList?.name : undefined,
        groupName: mode === 'group' ? groupName : undefined,
        groupEmails: mode === 'group' ? groupEmails : undefined,
        senderAddress: senderAddress || undefined,
      });
      setResult(res);
    } catch (e) {
      setResult({ ok: false, reason: 'error', message: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setSubmitting(false);
    }
  }

  const canSend =
    Boolean(subject.trim()) &&
    Boolean(body.trim()) &&
    amf.compliant &&
    !submitting &&
    (mode === 'people'
      ? peopleEmails.length > 0
      : mode === 'list'
        ? listId !== null
        : Boolean(groupName.trim()) && groupEmails.length > 0);

  const TABS: { id: Mode; label: string; icon: typeof Users }[] = [
    { id: 'people', label: 'Personnes', icon: Users },
    { id: 'list', label: 'Liste', icon: ListIcon },
    { id: 'group', label: 'Groupe', icon: UserPlus },
  ];

  return (
    <div className="w-full flex flex-col gap-4">
      {testMode && (
        <div className="alert alert-warning">
          <span className="alert-icon">
            <AlertTriangle size={16} />
          </span>
          <div className="alert-body">
            <div className="alert-title">Mode test activé</div>
            <div className="alert-description">
              Tout envoi part uniquement vers <strong>{testAddress}</strong> — aucun vrai
              destinataire n'est contacté.
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Colonne édition */}
        <div className="flex flex-col gap-4">
          {/* Destinataires */}
          <div className="view-card">
            <div className="view-card-header">
              <div className="view-card-title">Destinataires</div>
              <span className="badge badge-neutral">{recipientLabel}</span>
            </div>
            <div
              className="view-card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {TABS.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setMode(t.id)}
                      className={
                        mode === t.id ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'
                      }
                    >
                      <Icon size={13} />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {mode === 'people' && (
                <div className="form-field">
                  <label className="form-label" htmlFor="people">
                    Adresses email
                  </label>
                  <textarea
                    id="people"
                    className="textarea"
                    placeholder="jean@example.fr, marie@example.fr"
                    value={peopleRaw}
                    onChange={(e) => setPeopleRaw(e.target.value)}
                  />
                </div>
              )}
              {mode === 'list' && (
                <div className="form-field">
                  <label className="form-label" htmlFor="list">
                    Liste Brevo
                  </label>
                  <select
                    id="list"
                    className="select"
                    value={listId ?? ''}
                    onChange={(e) => setListId(Number(e.target.value))}
                  >
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.uniqueSubscribers} contacts)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {mode === 'group' && (
                <>
                  <div className="form-field">
                    <label className="form-label" htmlFor="gname">
                      Nom du groupe
                    </label>
                    <input
                      id="gname"
                      className="input"
                      placeholder="Ex: Prospects salon octobre"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label" htmlFor="gemails">
                      Contacts (emails)
                    </label>
                    <textarea
                      id="gemails"
                      className="textarea"
                      placeholder="jean@example.fr, marie@example.fr"
                      value={groupRaw}
                      onChange={(e) => setGroupRaw(e.target.value)}
                    />
                  </div>
                </>
              )}

              {senders.length > 1 && (
                <div className="form-field">
                  <label className="form-label" htmlFor="sender">
                    Envoyer depuis
                  </label>
                  <select
                    id="sender"
                    className="select"
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
            </div>
          </div>

          {/* Contenu */}
          <div className="view-card">
            <div className="view-card-header">
              <div className="view-card-title">Contenu de l'email</div>
              {subject || body ? (
                amf.compliant ? (
                  <span className="badge badge-success badge-dot">AMF OK</span>
                ) : (
                  <span className="badge badge-danger badge-dot">AMF : {amf.issues.length}</span>
                )
              ) : null}
            </div>
            <div
              className="view-card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div className="form-field">
                <label className="form-label" htmlFor="subject">
                  Objet de l'email
                </label>
                <input
                  id="subject"
                  className="input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: Nouveau projet disponible"
                />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="title">
                  Titre (grand, en haut du mail) — optionnel
                </label>
                <input
                  id="title"
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Un nouveau projet à Lyon"
                />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="body">
                  Message
                </label>
                <textarea
                  id="body"
                  className="textarea"
                  style={{ minHeight: 200 }}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Écris ton message. Une ligne vide = un saut de paragraphe. Rappel AMF : évite « garanti », « sans risque »."
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-field">
                  <label className="form-label" htmlFor="ctaLabel">
                    Bouton — texte (optionnel)
                  </label>
                  <input
                    id="ctaLabel"
                    className="input"
                    value={ctaLabel}
                    onChange={(e) => setCtaLabel(e.target.value)}
                    placeholder="Ex: Voir le projet"
                  />
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="ctaUrl">
                    Bouton — lien
                  </label>
                  <input
                    id="ctaUrl"
                    className="input"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    placeholder="https://app.sevenathome.com/..."
                  />
                </div>
              </div>

              {!amf.compliant && (subject || body) && (
                <div className="alert alert-danger">
                  <span className="alert-icon">
                    <AlertTriangle size={16} />
                  </span>
                  <div className="alert-body">
                    <div className="alert-title">Conformité AMF — à corriger</div>
                    <div className="alert-description">
                      <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
                        {amf.issues.map((i) => (
                          <li key={i.match} style={{ listStyle: 'disc' }}>
                            « {i.match} » → {i.suggestedFix}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {result?.ok && (
            <div className="alert alert-success">
              <span className="alert-icon">
                <CheckCircle size={16} />
              </span>
              <div className="alert-body">
                <div className="alert-title">
                  {result.testMode ? 'Email de test envoyé ✅' : 'Email envoyé ✅'}
                </div>
                <div className="alert-description">
                  {result.testMode
                    ? `Envoyé vers ${result.sentTo} (aurait visé : ${result.description}).`
                    : `Envoyé à : ${result.description}.`}
                </div>
              </div>
            </div>
          )}
          {result && !result.ok && result.reason === 'error' && (
            <div className="alert alert-danger">
              <span className="alert-icon">
                <AlertTriangle size={16} />
              </span>
              <div className="alert-body">
                <div className="alert-title">Envoi impossible</div>
                <div className="alert-description">{result.message}</div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={!canSend}
              onClick={handleSend}
            >
              <Send size={16} />
              {submitting ? 'Envoi…' : testMode ? `Envoyer (test → ${testAddress})` : 'Envoyer'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Cible : {recipientLabel}</span>
          </div>
        </div>

        {/* Colonne aperçu */}
        <div className="flex flex-col gap-2" style={{ position: 'sticky', top: 16 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--text-4)',
              paddingLeft: 4,
            }}
          >
            Aperçu de l'email
          </div>
          <iframe
            title="Aperçu de l'email"
            srcDoc={fullHtml}
            style={{
              width: '100%',
              height: 600,
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: '#fff',
              boxShadow: 'var(--shadow-glass-md)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
