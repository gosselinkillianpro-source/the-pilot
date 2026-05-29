'use client';

import { AlertTriangle, CheckCircle, List as ListIcon, Send, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { scanAmfCompliance } from '@/lib/ai/amf-compliance';
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
}: {
  lists: BrevoListLite[];
  testMode: boolean;
  testAddress: string;
}) {
  const [mode, setMode] = useState<Mode>('people');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [peopleRaw, setPeopleRaw] = useState('');
  const [listId, setListId] = useState<number | null>(lists[0]?.id ?? null);
  const [groupName, setGroupName] = useState('');
  const [groupRaw, setGroupRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SendEmailResult | null>(null);

  // Scan AMF en direct (même logique que côté serveur)
  const amf = useMemo(() => scanAmfCompliance(`${subject}\n${body}`), [subject, body]);

  const peopleEmails = parseEmails(peopleRaw);
  const groupEmails = parseEmails(groupRaw);

  const recipientLabel =
    mode === 'people'
      ? `${peopleEmails.length} adresse(s)`
      : mode === 'list'
        ? `liste « ${lists.find((l) => l.id === listId)?.name ?? '—'} » (${lists.find((l) => l.id === listId)?.uniqueSubscribers ?? 0} contacts)`
        : `groupe « ${groupName || '—'} » (${groupEmails.length} contacts)`;

  async function handleSend() {
    setResult(null);
    setSubmitting(true);
    try {
      const html = body
        .split('\n')
        .map((l) => (l.trim() === '' ? '<br/>' : `<p style="margin:0 0 12px">${l}</p>`))
        .join('');
      const res = await sendEmailAction({
        mode,
        subject,
        htmlContent: html,
        emails: mode === 'people' ? peopleEmails : undefined,
        listId: mode === 'list' && listId ? listId : undefined,
        listName: mode === 'list' ? lists.find((l) => l.id === listId)?.name : undefined,
        groupName: mode === 'group' ? groupName : undefined,
        groupEmails: mode === 'group' ? groupEmails : undefined,
      });
      setResult(res);
    } catch (e) {
      setResult({ ok: false, reason: 'error', message: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setSubmitting(false);
    }
  }

  const canSend =
    subject.trim() &&
    body.trim() &&
    amf.compliant &&
    !submitting &&
    (mode === 'people'
      ? peopleEmails.length > 0
      : mode === 'list'
        ? listId !== null
        : groupName.trim() && groupEmails.length > 0);

  const TABS: { id: Mode; label: string; icon: typeof Users }[] = [
    { id: 'people', label: 'Personnes', icon: Users },
    { id: 'list', label: 'Liste existante', icon: ListIcon },
    { id: 'group', label: 'Nouveau groupe', icon: UserPlus },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
      {/* Bandeau mode test */}
      {testMode && (
        <div className="alert alert-warning">
          <span className="alert-icon">
            <AlertTriangle size={16} />
          </span>
          <div className="alert-body">
            <div className="alert-title">Mode test activé</div>
            <div className="alert-description">
              Tout envoi part uniquement vers <strong>{testAddress}</strong> — aucun vrai
              destinataire n'est contacté. (Désactivable via EMAIL_TEST_MODE dans .env.local quand
              tu seras prêt.)
            </div>
          </div>
        </div>
      )}

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
          <div style={{ display: 'flex', gap: 4 }}>
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = mode === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMode(t.id)}
                  className={active ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
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
                Adresses email (séparées par virgule ou retour ligne)
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
                  Nom du nouveau groupe
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
                  Contacts du groupe (emails séparés par virgule/retour ligne)
                </label>
                <textarea
                  id="gemails"
                  className="textarea"
                  placeholder="jean@example.fr, marie@example.fr"
                  value={groupRaw}
                  onChange={(e) => setGroupRaw(e.target.value)}
                />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-4)' }}>
                Le groupe sera créé comme une liste dans Brevo, puis l'email lui sera envoyé.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Message */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Message</div>
          {subject || body ? (
            amf.compliant ? (
              <span className="badge badge-success badge-dot">AMF OK</span>
            ) : (
              <span className="badge badge-danger badge-dot">
                AMF : {amf.issues.length} problème(s)
              </span>
            )
          ) : null}
        </div>
        <div
          className="view-card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div className="form-field">
            <label className="form-label" htmlFor="subject">
              Objet
            </label>
            <input
              id="subject"
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Objet de l'email"
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
              placeholder="Écris ton message. Rappel AMF : pas de « garanti », « sans risque »… Mentionne « rendement cible, capital non garanti » si tu cites un rendement."
            />
          </div>

          {/* Problèmes AMF */}
          {!amf.compliant && (subject || body) && (
            <div className="alert alert-danger">
              <span className="alert-icon">
                <AlertTriangle size={16} />
              </span>
              <div className="alert-body">
                <div className="alert-title">Conformité AMF — à corriger avant envoi</div>
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

      {/* Résultat */}
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

      {/* Envoi */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" className="btn btn-primary" disabled={!canSend} onClick={handleSend}>
          <Send size={14} />
          {submitting ? 'Envoi…' : testMode ? `Envoyer (test → ${testAddress})` : 'Envoyer'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          Destinataires : {recipientLabel}
        </span>
      </div>
    </div>
  );
}
