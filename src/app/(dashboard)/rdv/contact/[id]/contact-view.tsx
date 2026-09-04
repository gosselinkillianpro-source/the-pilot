'use client';

import { Link2, Phone, Save, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import {
  type LinkCandidate,
  linkContactToInvestorAction,
  logContactCallAction,
  saveContactInfoAction,
  searchInvestorsToLinkAction,
} from './actions';

/**
 * Le poste de travail de la fiche prospect : enregistrer un appel (avec rappel
 * optionnel), tenir le bloc-notes et le téléphone à jour, relier la fiche à un
 * compte SAH créé sous un autre e-mail.
 */

type Outcome =
  | 'reached'
  | 'no_answer'
  | 'voicemail'
  | 'wrong_number'
  | 'callback_scheduled'
  | 'profile_incompatible'
  | 'in_progress';

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: 'reached', label: 'Joint' },
  { value: 'no_answer', label: 'Pas de réponse' },
  { value: 'voicemail', label: 'Répondeur' },
  { value: 'callback_scheduled', label: 'Rappel programmé' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'wrong_number', label: 'Mauvais numéro' },
  { value: 'profile_incompatible', label: 'Profil incompatible' },
];

const SEARCH_DEBOUNCE_MS = 300;

const inputStyle: React.CSSProperties = {
  fontSize: 13,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface-2)',
  color: 'var(--text-1)',
};

export function ContactActions({
  contactId,
  phone,
  notes,
  leadName,
}: {
  contactId: string;
  phone: string | null;
  notes: string | null;
  leadName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  // --- Appel ---
  const [outcome, setOutcome] = useState<Outcome>('reached');
  const [callNote, setCallNote] = useState('');
  const [callbackAt, setCallbackAt] = useState('');

  // --- Infos ---
  const [phoneDraft, setPhoneDraft] = useState(phone ?? '');
  const [notesDraft, setNotesDraft] = useState(notes ?? '');

  // --- Rapprochement SAH ---
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<LinkCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setCandidates([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const r = await searchInvestorsToLinkAction({ query: q });
      setSearching(false);
      if (r.ok) setCandidates(r.candidates);
      else toast(r.message, { variant: 'error' });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, toast]);

  function logCall() {
    // datetime-local vide → pas de rappel ; sinon conversion locale → ISO.
    let callbackIso: string | undefined;
    if (callbackAt) {
      const due = new Date(callbackAt);
      if (Number.isNaN(due.getTime())) {
        toast('Date de rappel invalide.', { variant: 'error' });
        return;
      }
      callbackIso = due.toISOString();
    }
    startTransition(async () => {
      const r = await logContactCallAction({
        contactId,
        outcome,
        note: callNote.trim() || undefined,
        callbackAt: callbackIso,
      });
      if (!r.ok) {
        toast(r.message, { variant: 'error' });
        return;
      }
      toast('Appel enregistré.', { variant: 'success' });
      setCallNote('');
      setCallbackAt('');
      router.refresh();
    });
  }

  function saveInfo() {
    startTransition(async () => {
      const r = await saveContactInfoAction({
        contactId,
        phone: phoneDraft.trim(),
        notes: notesDraft.trim(),
      });
      if (!r.ok) {
        toast(r.message, { variant: 'error' });
        return;
      }
      toast('Fiche mise à jour.', { variant: 'success' });
      router.refresh();
    });
  }

  function link(candidate: LinkCandidate) {
    startTransition(async () => {
      const r = await linkContactToInvestorAction({
        contactId,
        investorId: candidate.investorId,
      });
      if (!r.ok) {
        toast(r.message, { variant: 'error' });
        return;
      }
      toast(`${leadName} relié(e) à la fiche SAH — redirection…`, { variant: 'success' });
      router.push(`/closing/investor/${candidate.investorId}`);
    });
  }

  return (
    <div
      className="split-2col"
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}
    >
      {/* Enregistrer un appel */}
      <div className="view-card">
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Phone size={15} />
            Enregistrer un appel
          </div>
        </div>
        <div
          className="view-card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {OUTCOMES.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`btn btn-sm ${outcome === o.value ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setOutcome(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <textarea
            value={callNote}
            onChange={(e) => setCallNote(e.target.value)}
            placeholder="Résumé de l'appel (optionnel)…"
            rows={3}
            maxLength={2000}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Rappel :{' '}
              <input
                type="datetime-local"
                value={callbackAt}
                onChange={(e) => setCallbackAt(e.target.value)}
                style={{ ...inputStyle, padding: '6px 8px', fontSize: 12 }}
              />
            </label>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={logCall}
              disabled={pending}
              style={{ marginLeft: 'auto' }}
            >
              {pending ? 'Enregistrement…' : "Enregistrer l'appel"}
            </button>
          </div>
        </div>
      </div>

      {/* Infos + notes + rapprochement */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Infos & notes</div>
        </div>
        <div
          className="view-card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <input
            type="tel"
            value={phoneDraft}
            onChange={(e) => setPhoneDraft(e.target.value)}
            placeholder="Téléphone (ex. +33 6 12 34 56 78)"
            maxLength={30}
            style={inputStyle}
          />
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Bloc-notes de la fiche (contexte, besoins, montant envisagé…)"
            rows={4}
            maxLength={4000}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <button
            type="button"
            className="btn btn-sm"
            onClick={saveInfo}
            disabled={pending}
            style={{ alignSelf: 'flex-end' }}
          >
            <Save size={13} />
            Sauvegarder
          </button>

          <div
            style={{
              borderTop: '1px dashed var(--border)',
              paddingTop: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-3)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Link2 size={13} />
              Inscrit(e) sous un autre e-mail ? Relie cette fiche à son compte SAH :
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Search size={14} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Chercher par nom ou e-mail…"
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
            {query.trim().length >= 2 && (
              <div
                style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}
              >
                {searching ? (
                  <div style={{ padding: '9px 12px', fontSize: 12.5, color: 'var(--text-4)' }}>
                    Recherche…
                  </div>
                ) : candidates.length === 0 ? (
                  <div style={{ padding: '9px 12px', fontSize: 12.5, color: 'var(--text-4)' }}>
                    Aucune fiche SAH ne correspond.
                  </div>
                ) : (
                  candidates.map((c) => (
                    <button
                      key={c.investorId}
                      type="button"
                      onClick={() => link(c)}
                      disabled={pending}
                      style={{
                        display: 'flex',
                        width: '100%',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '8px 12px',
                        fontSize: 13,
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        borderBottom:
                          '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
                        color: 'var(--text-1)',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <strong>{c.fullName ?? '—'}</strong>{' '}
                        <span style={{ color: 'var(--text-4)' }}>· {c.email}</span>
                      </span>
                      <Link2 size={13} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
