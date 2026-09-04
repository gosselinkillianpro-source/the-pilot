'use client';

import { Copy, Flame, PhoneCall, Sparkles, Target, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { CallResultForm } from '@/components/closing/call-result-form';
import { useToast } from '@/components/shared/toast';
import type { CallBrief } from '@/lib/ai/call-brief';
import { type InvestorOrigin, originMeta } from '@/lib/closing/origin';
import { claimLeadAction, draftCallBriefAction, releaseLeadAction } from '../investor/[id]/actions';

export type SessionLead = {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  isBreach: boolean;
  origin: InvestorOrigin;
  totalInvested: number;
  priority: number;
  temperature: 'hot' | 'warm' | 'cold';
  temperatureLabel: string;
  statusLabel: string;
  queueLabel: string;
  callGoal: string;
  factors: string[];
  /** Appels sans réponse depuis le dernier contact abouti — pour proposer la bonne suite. */
  missedAttempts: number;
};

const TEMP_COLOR: Record<SessionLead['temperature'], string> = {
  hot: 'var(--danger)',
  warm: 'var(--warning)',
  cold: 'var(--text-3)',
};

function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

/**
 * Le mode appel : une personne à la fois, et un appel n'est enregistré
 * qu'avec sa suite (formulaire partagé avec la fiche).
 */
export function SessionClient({ leads, exitHref }: { leads: SessionLead[]; exitHref: string }) {
  const { toast, runWithActivity } = useToast();
  // La liste est FIGÉE au lancement : le temps réel (LiveSync) re-rend la page
  // pendant la session, et une liste qui se réordonne sous les pieds du closer
  // ferait enregistrer le résultat sur le MAUVAIS lead. On avance par index
  // dans cette photo — un lead pris entre-temps est refusé au moment d'écrire.
  const [sessionLeads] = useState(leads);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(0);
  const [brief, setBrief] = useState<CallBrief | null>(null);
  const [pending, startTransition] = useTransition();

  const lead = sessionLeads[index];

  // « Je prends » automatique sur le lead affiché : les collègues le voient
  // réservé et leurs sessions ne le proposent plus. Si la réservation échoue
  // (pris pendant qu'on lisait la fiche), on passe au suivant.
  const leadId = lead?.id ?? null;
  useEffect(() => {
    if (!leadId) return;
    let cancelled = false;
    claimLeadAction({ investorId: leadId }).then((res) => {
      if (!res.ok && !cancelled) {
        toast('Cette personne vient d’être prise par un collègue — on passe à la suivante.', {
          variant: 'info',
          duration: 3500,
        });
        setIndex((i) => i + 1);
      }
    });
    return () => {
      cancelled = true;
      // Personne quittée (suivante, ou sortie) : on rend la réservation. Après
      // un appel enregistré, elle est déjà levée côté serveur — libérer à
      // nouveau est sans effet (on ne libère jamais que la sienne).
      void releaseLeadAction({ investorId: leadId });
    };
  }, [leadId, toast]);

  function next() {
    setBrief(null);
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
            {sessionLeads.length === 0 ? 'Rien à appeler pour l’instant' : 'Session terminée'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {sessionLeads.length === 0
              ? 'Aucune action due, personne dans le pool. Reviens plus tard ou ouvre Mes clients.'
              : `${done} appel(s) enregistré(s) sur ${sessionLeads.length} personne(s).`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={exitHref} className="btn btn-primary">
              Retour
            </Link>
            <Link href="/closing/clients" className="btn btn-secondary">
              Mes clients
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
          Appel <strong style={{ color: 'var(--text-1)' }}>{index + 1}</strong> /{' '}
          {sessionLeads.length}
          {done > 0 ? ` · ${done} enregistré(s)` : ''}
        </div>
        <Link href={exitHref} className="btn btn-ghost btn-sm">
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
                <span
                  className={`badge ${originMeta(lead.origin).badge}`}
                  title={originMeta(lead.origin).hint}
                >
                  {originMeta(lead.origin).label}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {lead.statusLabel}
                {lead.city ? ` · ${lead.city}` : ''}
                {lead.totalInvested > 0 ? ` · ${money(lead.totalInvested)} investis` : ''}
                {lead.missedAttempts > 0 ? ` · ${lead.missedAttempts} sans réponse` : ''}
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

          {/* Pourquoi on appelle + ce qu'on sait */}
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
              href={`/closing/investor/${lead.id}?from=${encodeURIComponent(exitHref)}`}
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

          {/* Résultat + suite : une seule saisie */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <CallResultForm
              key={lead.id}
              investorId={lead.id}
              name={lead.fullName ?? lead.email}
              missedAttempts={lead.missedAttempts}
              submitLabel="Enregistrer & suivant"
              onSaved={() => {
                setDone((d) => d + 1);
                next();
              }}
            />
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={next}>
                Passer sans enregistrer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
