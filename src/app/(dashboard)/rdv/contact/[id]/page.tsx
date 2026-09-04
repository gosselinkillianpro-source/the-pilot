import { ArrowLeft, CalendarClock, Mail, Phone, UserRound } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getContactReminders,
  getContactTimeline,
  getRdvContactDetail,
} from '@/lib/db/queries/rdv-contact-detail';
import { STAGES } from '@/lib/webinars/pipeline';
import { ContactActions } from './contact-view';

export const dynamic = 'force-dynamic';

/**
 * Fiche PROSPECT d'un lead RDV Calendly — la personne n'est pas (encore)
 * inscrite SAH, mais le closer doit pouvoir travailler : appeler, noter,
 * programmer un rappel, retrouver son téléphone. Dès qu'elle a un compte
 * (auto ou reliée à la main), on bascule sur la vraie fiche investisseur.
 */

const INTERACTION_LABELS: Record<string, string> = {
  call_outbound: 'Appel sortant',
  call_inbound: 'Appel entrant',
  note_added: 'Note',
  email_sent: 'Email envoyé',
  whatsapp_sent: 'WhatsApp envoyé',
  sms_sent: 'SMS envoyé',
  meeting_booked: 'RDV pris',
  meeting_done: 'RDV fait',
};

const OUTCOME_LABELS: Record<string, string> = {
  reached: 'Joint',
  no_answer: 'Pas de réponse',
  voicemail: 'Répondeur',
  wrong_number: 'Mauvais numéro',
  callback_scheduled: 'Rappel programmé',
  profile_incompatible: 'Profil incompatible',
  in_progress: 'En cours',
};

function stageLabel(stage: string | null): string {
  if (!stage) return 'Pas encore suivi';
  return STAGES.find((s) => s.stage === stage)?.label ?? stage;
}

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export default async function RdvContactPage({ params }: { params: Promise<{ id: string }> }) {
  await getAuthenticatedUser();
  const { id } = await params;
  const contact = await getRdvContactDetail(id);
  if (!contact) notFound();
  // La personne a une fiche SAH : c'est elle qui fait foi, pas de doublon d'écran.
  if (contact.investorId) redirect(`/closing/investor/${contact.investorId}`);

  const [timeline, reminders] = await Promise.all([
    getContactTimeline(contact.id),
    getContactReminders(contact.id),
  ]);

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/rdv"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12.5,
            color: 'var(--text-3)',
          }}
        >
          <ArrowLeft size={14} />
          Retour aux rendez-vous
        </Link>
      </div>

      {/* En-tête fiche */}
      <div className="view-card" style={{ marginBottom: 16 }}>
        <div
          className="view-card-body"
          style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'var(--brand-bg-strong)',
              color: 'var(--brand)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <UserRound size={22} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 className="page-title" style={{ margin: 0, fontSize: 22 }}>
                {contact.fullName ?? contact.email}
              </h1>
              <span className="badge badge-warning">Prospect — pas encore inscrit SAH</span>
              <span className="badge badge-neutral">{stageLabel(contact.stage)}</span>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 16,
                flexWrap: 'wrap',
                marginTop: 8,
                fontSize: 13,
                color: 'var(--text-2)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Mail size={13} style={{ color: 'var(--text-4)' }} />
                {contact.email}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Phone size={13} style={{ color: 'var(--text-4)' }} />
                {contact.phone ? (
                  <a href={`tel:${contact.phone}`} style={{ color: 'var(--brand)' }}>
                    {contact.phone}
                  </a>
                ) : (
                  <span style={{ color: 'var(--text-4)' }}>numéro inconnu — à renseigner</span>
                )}
              </span>
              {contact.ownerName ? (
                <span style={{ color: 'var(--text-3)' }}>Suivi par {contact.ownerName}</span>
              ) : null}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 6 }}>
              Vu via un RDV Calendly · fiche créée le{' '}
              {contact.createdAt.toLocaleDateString('fr-FR')}. Quand la personne s'inscrira sur SAH
              avec cet e-mail, la fiche basculera automatiquement sur son profil investisseur.
            </div>
          </div>
        </div>
      </div>

      {/* Rappels en attente */}
      {reminders.length > 0 && (
        <div className="view-card" style={{ marginBottom: 16 }}>
          <div className="view-card-body" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {reminders.map((r) => (
              <span
                key={r.id}
                className="badge badge-warning"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <CalendarClock size={12} />
                Rappel {DATE_FMT.format(r.dueAt)}
                {r.note ? ` — ${r.note}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions : appel, infos, notes, rapprochement */}
      <ContactActions
        contactId={contact.id}
        phone={contact.phone}
        notes={contact.notes}
        leadName={contact.fullName ?? contact.email}
      />

      {/* Historique */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Historique</div>
          <span className="badge badge-neutral">{timeline.length}</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {timeline.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--text-3)' }}>
              Aucune action enregistrée pour l'instant. Le premier appel enregistré apparaîtra ici.
            </div>
          ) : (
            timeline.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  padding: '11px 20px',
                  borderBottom:
                    idx === timeline.length - 1
                      ? 'none'
                      : '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
                }}
              >
                <Phone size={14} style={{ color: 'var(--text-4)', marginTop: 2, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}>
                    {INTERACTION_LABELS[item.type] ?? item.type}
                    {item.outcome ? (
                      <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>
                        {' '}
                        · {OUTCOME_LABELS[item.outcome] ?? item.outcome}
                      </span>
                    ) : null}
                  </div>
                  {item.note ? (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: 'var(--text-2)',
                        marginTop: 3,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {item.note}
                    </div>
                  ) : null}
                  <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 3 }}>
                    {DATE_FMT.format(item.createdAt)}
                    {item.userName ? ` · ${item.userName}` : ''}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
