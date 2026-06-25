'use client';

import { ChevronDown, ChevronUp, NotebookPen } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useState, useTransition } from 'react';
import type { RdvReel, RdvStatut } from '@/lib/integrations/calendly/rdv';
import { recordRdvOutcomeAction } from './actions';

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

function fmtHeure(d: Date): string {
  return new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateCourt(d: Date): string {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}
function fmtAgo(d: Date): string {
  const ms = Date.now() - new Date(d).getTime();
  const j = Math.floor(ms / 86_400_000);
  if (j <= 0) return "aujourd'hui";
  if (j === 1) return 'hier';
  return `il y a ${j} j`;
}

function statutBadge(s: RdvStatut): { label: string; cls: string } {
  switch (s) {
    case 'a_venir':
      return { label: 'À venir', cls: 'badge-brand' };
    case 'honore':
      return { label: 'Honoré', cls: 'badge-success' };
    case 'no_show':
      return { label: 'No-show', cls: 'badge-danger' };
    case 'reporte':
      return { label: 'Reporté', cls: 'badge-warning' };
    case 'annule':
      return { label: 'Annulé', cls: 'badge-neutral' };
  }
}

function etapeBadge(label: string): string {
  if (label === 'Souscrit') return 'badge-success';
  if (label === 'Perdu') return 'badge-danger';
  if (label === 'Dormant') return 'badge-warning';
  return 'badge-neutral';
}

export function SuiviTable({ rows }: { rows: RdvReel[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="table-scroll">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-4)' }}>
            <Th>Lead</Th>
            <Th>Inscription</Th>
            <Th>Source</Th>
            <Th>Date RDV</Th>
            <Th>RDV</Th>
            <Th>Étape</Th>
            <Th align="right">Investi</Th>
            <Th align="right">Compte-rendu</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const b = statutBadge(r.statut);
            const open = openId === r.id;
            return (
              <Fragment key={r.id}>
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <Td>
                    {r.investorId ? (
                      <Link
                        href={`/closing/investor/${r.investorId}`}
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: 'var(--brand)',
                          textDecoration: 'none',
                        }}
                      >
                        {r.lead}
                      </Link>
                    ) : (
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                        {r.lead}
                      </span>
                    )}
                    {r.email ? (
                      <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{r.email}</div>
                    ) : null}
                    {r.derniereAction ? (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                        Dernière action : {r.derniereAction.label} · {fmtAgo(r.derniereAction.at)}
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    {r.statutInscription ? (
                      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        {r.statutInscription}
                      </span>
                    ) : (
                      '—'
                    )}
                    {r.score != null ? (
                      <span className="badge badge-neutral" style={{ marginLeft: 6, fontSize: 10 }}>
                        score {r.score}
                      </span>
                    ) : null}
                  </Td>
                  <Td>{r.source}</Td>
                  <Td>
                    {fmtDateCourt(r.date)} · {fmtHeure(r.date)}
                  </Td>
                  <Td>
                    <span className={`badge ${b.cls}`}>{b.label}</span>
                  </Td>
                  <Td>
                    <span className={`badge ${etapeBadge(r.etape)}`}>{r.etape}</span>
                  </Td>
                  <Td align="right">
                    <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                      {r.montantInvestiEur != null ? EUR.format(r.montantInvestiEur) : '—'}
                    </span>
                  </Td>
                  <Td align="right">
                    {r.investorId ? (
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : r.id)}
                        className="badge badge-brand"
                        style={{
                          cursor: 'pointer',
                          border: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <NotebookPen size={12} />
                        {open ? 'Fermer' : 'Saisir'}
                        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-4)' }}>hors base</span>
                    )}
                  </Td>
                </tr>
                {open && r.investorId ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 0, background: 'var(--glass-bg-strong)' }}>
                      <OutcomeForm
                        investorId={r.investorId}
                        rdv={r}
                        onDone={() => setOpenId(null)}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const STAGE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— Ne pas changer —' },
  { value: 'meeting_done', label: 'RDV fait' },
  { value: 'proposal_sent', label: 'Proposition envoyée' },
  { value: 'closed_won', label: 'Souscrit' },
  { value: 'dormant', label: 'En sommeil' },
  { value: 'closed_lost', label: 'Perdu' },
];

function OutcomeForm({
  investorId,
  rdv,
  onDone,
}: {
  investorId: string;
  rdv: RdvReel;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [depotMin, setDepotMin] = useState('');
  const [depotMax, setDepotMax] = useState('');
  const [depotQuand, setDepotQuand] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [nextStage, setNextStage] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function submit() {
    setMsg(null);
    startTransition(async () => {
      const res = await recordRdvOutcomeAction({
        investorId,
        note: note.trim() || undefined,
        depotMin: depotMin ? Number(depotMin) : undefined,
        depotMax: depotMax ? Number(depotMax) : undefined,
        depotQuand: depotQuand.trim() || undefined,
        callbackAt: callbackAt ? new Date(callbackAt).toISOString() : undefined,
        nextStage: nextStage ? (nextStage as never) : undefined,
      });
      if (res.ok) {
        setMsg({ ok: true, text: 'Enregistré ✓' });
        router.refresh();
        setTimeout(onDone, 700);
      } else {
        setMsg({ ok: false, text: res.message });
      }
    });
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Contexte existant */}
      {(rdv.prochainRappel || rdv.depotSouhaite) && (
        <div
          style={{
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            fontSize: 12,
            color: 'var(--text-3)',
          }}
        >
          {rdv.prochainRappel ? (
            <span>
              ⏰ Rappel prévu :{' '}
              <strong>
                {new Date(rdv.prochainRappel.dueAt).toLocaleString('fr-FR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>
            </span>
          ) : null}
          {rdv.depotSouhaite ? (
            <span>
              💶 Dépôt souhaité :{' '}
              <strong>
                {rdv.depotSouhaite.minEur != null ? EUR.format(rdv.depotSouhaite.minEur) : '?'}
                {rdv.depotSouhaite.maxEur != null
                  ? ` – ${EUR.format(rdv.depotSouhaite.maxEur)}`
                  : ''}
              </strong>
              {rdv.depotSouhaite.quand ? ` (${rdv.depotSouhaite.quand})` : ''}
            </span>
          ) : null}
        </div>
      )}

      <Field label="Compte-rendu de l'appel">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ce qui s'est dit, objections, prochaines étapes…"
          rows={3}
          style={textareaStyle}
        />
      </Field>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
        }}
      >
        <Field label="Montant souhaité — min (€)">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={depotMin}
            onChange={(e) => setDepotMin(e.target.value)}
            placeholder="ex. 10000"
            style={inputStyle}
          />
        </Field>
        <Field label="Montant souhaité — max (€)">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={depotMax}
            onChange={(e) => setDepotMax(e.target.value)}
            placeholder="ex. 25000"
            style={inputStyle}
          />
        </Field>
        <Field label="Quand ?">
          <input
            type="text"
            value={depotQuand}
            onChange={(e) => setDepotQuand(e.target.value)}
            placeholder="ex. avant le 15/07"
            style={inputStyle}
          />
        </Field>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <Field label="Programmer un rappel">
          <input
            type="datetime-local"
            value={callbackAt}
            onChange={(e) => setCallbackAt(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Mettre à jour l'étape">
          <select
            value={nextStage}
            onChange={(e) => setNextStage(e.target.value)}
            style={inputStyle}
          >
            {STAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="badge badge-brand"
          style={{
            cursor: pending ? 'wait' : 'pointer',
            border: 'none',
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 700,
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? 'Enregistrement…' : 'Enregistrer le compte-rendu'}
        </button>
        {msg ? (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: msg.ok ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {msg.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid var(--border-strong)',
  background: 'var(--bg-1, #fff)',
  color: 'var(--text-1)',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  fontFamily: 'inherit',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: le contrôle est fourni via children (input/select/textarea), non détectable statiquement.
    <label style={{ display: 'block' }}>
      <span
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-3)',
          marginBottom: 4,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      style={{
        padding: '10px 16px',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        textAlign: align,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td style={{ padding: '12px 16px', textAlign: align, color: 'var(--text-2)' }}>{children}</td>
  );
}
