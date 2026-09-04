import { Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import { Chrono } from '@/components/ui/chrono';
import { Pill, StatePill } from '@/components/ui/pill';
import type { AuthenticatedUser } from '@/lib/auth';
import { labelFor, questionLabel } from '@/lib/domain/answers/mep';
import {
  ACTOR_LABELS,
  CALL_OUTCOME_LABELS,
  EVENT_LABELS,
  HORS_CIBLE_LABELS,
  NURTURE_LABELS,
} from '@/lib/domain/event-labels';
import { renderTemplate } from '@/lib/domain/messages';
import { formatPhoneForDisplay } from '@/lib/domain/phone';
import { formatParis } from '@/lib/domain/time';
import type { LeadDetail } from '@/lib/leads/queries';
import { CallActions } from './call-actions';
import { CriteriaChecklist } from './criteria-checklist';
import { NotesEditor } from './notes-editor';

const HIDDEN_ANSWERS = new Set(['form_type']);

export function AnswersGrid({ answers }: { answers: Record<string, string> }) {
  const entries = Object.entries(answers).filter(([k]) => !HIDDEN_ANSWERS.has(k));
  if (!entries.length) return <p className="hint">Aucune réponse reçue pour l’instant.</p>;
  return (
    <dl className="kv">
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{questionLabel(k)}</dt>
          <dd>{labelFor(k, v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function eventDetail(e: LeadDetail['events'][number]): string | null {
  const p = e.payload ?? {};
  switch (e.kind) {
    case 'attempt_missed':
      return `tentative ${String(p.attempt ?? '?')}${p.next_attempt_at ? ` · relance ${formatParis.dateTime(new Date(String(p.next_attempt_at)))}` : ''}`;
    case 'callback_later':
    case 'callback_requested':
      return p.callback_at ? `le ${formatParis.dateTime(new Date(String(p.callback_at)))}` : null;
    case 'nurture':
      return NURTURE_LABELS[String(p.reason)] ?? null;
    case 'out_of_target':
      return (
        [HORS_CIBLE_LABELS[String(p.reason)], p.note ? String(p.note) : null]
          .filter(Boolean)
          .join(' · ') || null
      );
    case 'rdv_posed':
      return p.scheduled_at ? `le ${formatParis.dateTime(new Date(String(p.scheduled_at)))}` : null;
    default:
      return null;
  }
}

export function LeadTimeline({ detail }: { detail: LeadDetail }) {
  return (
    <div className="timeline">
      {detail.events.map((e) => (
        <div
          key={e.id}
          className={`timeline-item${e.kind === 'rdv_posed' || e.kind === 'received' ? ' brand' : ''}`}
        >
          <div className="timeline-time">
            {formatParis.dateTime(e.at)} · {ACTOR_LABELS[e.actorType] ?? e.actorType}
          </div>
          <div>
            {EVENT_LABELS[e.kind] ?? e.kind}
            {eventDetail(e) ? <span className="hint"> — {eventDetail(e)}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LeadFiche({
  detail,
  user,
  variant,
}: {
  detail: LeadDetail;
  user: AuthenticatedUser;
  variant: 'drawer' | 'page';
}) {
  const { lead, source, campaign } = detail;
  const editable = !['hors_cible', 'a_nourrir', 'perdu', 'signe'].includes(lead.state);
  const script = source.script;
  const vars = {
    prenom: lead.firstName,
    setter: user.name ?? user.email.split('@')[0] ?? '',
    montant: labelFor('montant', lead.answers.montant),
    objectif: labelFor('objectif', lead.answers.objectif).toLowerCase(),
    urgence: labelFor('urgence', lead.answers.urgence).toLowerCase(),
  };
  const buyerOptions = detail.buyers.map((b) => ({
    id: b.id,
    name: b.name,
    bookingUrl: b.calendarConfig?.booking_url,
    durationMin: b.calendarConfig?.duration_min ?? 30,
    priceCents: b.pricePerRdvCents,
  }));
  const excluded = detail.routing.excluded.map((e) => ({
    buyerId: e.candidate.buyerId,
    name: e.candidate.name,
    reason: e.reason,
  }));
  const eligible = detail.routing.eligible.map((c) => ({ buyerId: c.buyerId, name: c.name }));

  const header = (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2
            style={{
              fontSize: variant === 'page' ? 26 : 22,
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            {lead.firstName}
          </h2>
          <div className="row" style={{ gap: 8, marginTop: 6 }}>
            <StatePill state={lead.state} />
            <Pill>{source.code}</Pill>
            {lead.stateReason ? (
              <Pill tone="neutral">{HORS_CIBLE_LABELS[lead.stateReason] ?? lead.stateReason}</Pill>
            ) : null}
          </div>
        </div>
        <Chrono
          minutesAtRender={detail.minutesWaiting}
          frozen={lead.firstCallAt !== null}
          targetMin={source.slaTargetMin}
          alertMin={source.slaAlertMin}
        />
      </div>
      <div className="row" style={{ gap: 16, fontSize: 14 }}>
        <a
          href={`tel:${lead.phoneE164}`}
          className="row"
          style={{ gap: 6, fontWeight: 600, color: 'var(--brand-text)' }}
        >
          <Phone size={15} /> {formatPhoneForDisplay(lead.phoneE164)}
        </a>
        {lead.email ? (
          <a
            href={`mailto:${lead.email}`}
            className="row"
            style={{ gap: 6, color: 'var(--text-2)' }}
          >
            <Mail size={15} /> {lead.email}
          </a>
        ) : null}
      </div>
      <div className="hint">
        Reçu le {formatParis.long(lead.receivedAt)}
        {campaign
          ? ` · ${campaign.name}${campaign.adsetName ? ` · ${campaign.adsetName}` : ''}${campaign.adName ? ` · ${campaign.adName}` : ''}`
          : ''}
        {lead.firstCallAt ? ` · premier appel ${formatParis.dateTime(lead.firstCallAt)}` : ''}
        {lead.nextAttemptAt && lead.state === 'a_rappeler'
          ? ` · prochaine relance ${formatParis.dateTime(lead.nextAttemptAt)}`
          : ''}
        {lead.callbackAt && lead.state === 'a_rappeler_plus_tard'
          ? ` · rappel convenu ${formatParis.dateTime(lead.callbackAt)}`
          : ''}
      </div>
    </div>
  );

  const actions = (
    <CallActions
      leadId={lead.id}
      state={lead.state}
      phoneE164={lead.phoneE164}
      buyers={buyerOptions}
      eligible={eligible}
      excluded={excluded}
      isAdmin={user.role === 'admin'}
    />
  );

  const criteria = (
    <CriteriaChecklist
      leadId={lead.id}
      criteria={detail.criteria}
      checks={detail.qualification?.criteria ?? {}}
      buyerQualifications={detail.buyerQualifications.map((q) => ({
        buyerId: q.buyerId,
        name: detail.buyers.find((b) => b.id === q.buyerId)?.name ?? '?',
        qualified: q.qualified,
        score: q.score,
        mandatoryTotal: q.mandatoryTotal,
      }))}
      editable={editable}
    />
  );

  const notes = (
    <NotesEditor leadId={lead.id} initial={detail.qualification?.notes ?? ''} editable={editable} />
  );

  const scriptBlock = script ? (
    <div className="stack" style={{ gap: 10 }}>
      <div className="script-block">
        <h4>1 · Présentation</h4>
        {renderTemplate(script.presentation, vars)}
      </div>
      <div className="script-block">
        <h4>2 · Capacité</h4>
        {renderTemplate(script.capacite, vars)}
      </div>
      <div className="script-block">
        <h4>3 · Créneau</h4>
        {renderTemplate(script.creneau, vars)}
      </div>
      {script.interdits.length ? (
        <div className="banner banner-danger" style={{ alignItems: 'flex-start' }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {script.interdits.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  ) : (
    <p className="hint">Aucun script configuré pour cette source (Réglages → Sources).</p>
  );

  const appointmentsBlock = detail.appointments.length ? (
    <div className="stack" style={{ gap: 8 }}>
      {detail.appointments.map(({ appointment: a, buyerName }) => (
        <div key={a.id} className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
          <span>
            <strong>{buyerName}</strong> · {formatParis.long(a.scheduledAt)}
          </span>
          <Pill tone={a.status === 'pose' ? 'info' : a.status === 'honore' ? 'success' : 'neutral'}>
            {a.status}
          </Pill>
        </div>
      ))}
    </div>
  ) : null;

  const attemptsBlock = detail.attempts.length ? (
    <div className="stack" style={{ gap: 6, fontSize: 13.5 }}>
      {detail.attempts.map((a) => (
        <div key={a.id} className="row" style={{ justifyContent: 'space-between' }}>
          <span>{formatParis.dateTime(a.startedAt)}</span>
          <span className="hint">{a.outcome ? CALL_OUTCOME_LABELS[a.outcome] : 'en cours'}</span>
        </div>
      ))}
    </div>
  ) : null;

  if (variant === 'drawer') {
    return (
      <div className="stack" style={{ gap: 22 }}>
        {header}
        {actions}
        <Section title="Réponses du diagnostic">
          <AnswersGrid answers={lead.answers} />
        </Section>
        <Section title="Critères">{criteria}</Section>
        <Section title="Notes">{notes}</Section>
        {appointmentsBlock ? <Section title="Rendez-vous">{appointmentsBlock}</Section> : null}
        <Section title="Script">{scriptBlock}</Section>
        <Section title="Historique">
          <LeadTimeline detail={detail} />
        </Section>
        <p className="hint">
          <Link href={`/leads/${lead.id}`}>Ouvrir la fiche en pleine page ↗</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="fiche-layout">
      <div className="stack" style={{ gap: 20 }}>
        <div className="card card-body stack" style={{ gap: 18 }}>
          {header}
          {actions}
        </div>
        <div className="card">
          <div className="card-head">Réponses du diagnostic</div>
          <div className="card-body">
            <AnswersGrid answers={lead.answers} />
          </div>
        </div>
        <div className="card">
          <div className="card-head">Critères des acheteurs</div>
          <div className="card-body">{criteria}</div>
        </div>
        <div className="card">
          <div className="card-head">Notes de l’appel</div>
          <div className="card-body">{notes}</div>
        </div>
      </div>
      <div className="stack" style={{ gap: 20 }}>
        <div className="card">
          <div className="card-head">Script</div>
          <div className="card-body">{scriptBlock}</div>
        </div>
        {appointmentsBlock ? (
          <div className="card">
            <div className="card-head">Rendez-vous</div>
            <div className="card-body">{appointmentsBlock}</div>
          </div>
        ) : null}
        {attemptsBlock ? (
          <div className="card">
            <div className="card-head">Tentatives d’appel</div>
            <div className="card-body">{attemptsBlock}</div>
          </div>
        ) : null}
        <div className="card">
          <div className="card-head">Historique</div>
          <div className="card-body">
            <LeadTimeline detail={detail} />
          </div>
        </div>
        <div className="card">
          <div className="card-head">Consentement</div>
          <div className="card-body hint" style={{ lineHeight: 1.5 }}>
            « {lead.consentText} »
            <br />
            {formatParis.long(lead.consentAt)}
            {lead.consentVersion ? ` · version ${lead.consentVersion}` : ''}
            {lead.consentIpHash ? ' · IP hachée conservée' : ''}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="stack" style={{ gap: 10 }}>
      <h3
        style={{
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-3)',
          fontWeight: 700,
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}
