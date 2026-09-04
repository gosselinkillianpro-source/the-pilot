import 'server-only';
import { eq } from 'drizzle-orm';
import { createSignedLink } from '@/lib/crypto/signed-links';
import { appointments, buyers, leads, sources } from '@/lib/db/schema';
import { asSystem, type Tx } from '@/lib/db/session';
import { labelFor, questionLabel } from '@/lib/domain/answers/mep';
import { maskEmail, maskPhone } from '@/lib/domain/mask';
import {
  DEFAULT_CONFIRMATION_SMS,
  DEFAULT_REMINDER_SMS,
  renderTemplate,
} from '@/lib/domain/messages';
import { formatPhoneForDisplay } from '@/lib/domain/phone';
import { formatParis } from '@/lib/domain/time';
import { esc, renderEmail } from '@/lib/email/template';
import { sendEmail } from '@/lib/integrations/brevo/email';
import { sendSms } from '@/lib/integrations/brevo/sms';
import { logNotification } from '@/lib/notifications/log';
import { type JobHandler, registerJob } from '../queue';

/**
 * Module D — confirmations et rappels (section 4.4).
 * Lead : SMS + email avec date, heure, nom de l'expert, lien de replanification.
 * Acheteur : email avec la fiche (réponses + notes du setter). Aucun produit.
 */
type Loaded = {
  appointment: typeof appointments.$inferSelect;
  lead: typeof leads.$inferSelect;
  buyer: typeof buyers.$inferSelect;
  source: typeof sources.$inferSelect;
};

async function load(tx: Tx, appointmentId: string): Promise<Loaded | null> {
  const rows = await tx
    .select({ appointment: appointments, lead: leads, buyer: buyers, source: sources })
    .from(appointments)
    .innerJoin(leads, eq(leads.id, appointments.leadId))
    .innerJoin(buyers, eq(buyers.id, appointments.buyerId))
    .innerJoin(sources, eq(sources.id, leads.sourceId))
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  return rows[0] ?? null;
}

const SKIP_KEYS = new Set(['form_type']);

function answersTable(answers: Record<string, string>): string {
  const rows = Object.entries(answers)
    .filter(([k]) => !SKIP_KEYS.has(k))
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#8A8A94;width:45%">${esc(questionLabel(k))}</td><td style="padding:6px 0;font-weight:600">${esc(labelFor(k, v))}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;font-size:14px;margin-top:12px">${rows}</table>`;
}

const confirmations: JobHandler = async (payload) => {
  const appointmentId = String(payload.appointmentId);
  await asSystem(async (tx) => {
    const found = await load(tx, appointmentId);
    if (!found || found.appointment.status !== 'pose') return;
    const { appointment, lead, buyer, source } = found;
    const when = formatParis.long(appointment.scheduledAt);
    const link = await createSignedLink(tx, {
      purpose: 'reschedule',
      leadId: lead.id,
      appointmentId,
      buyerId: buyer.id,
      ttlHours: Math.max(24, (appointment.scheduledAt.getTime() - Date.now()) / 3600000 + 24),
    });

    // SMS au lead
    const smsText = renderTemplate(DEFAULT_CONFIRMATION_SMS, {
      source: source.name,
      expert: buyer.name,
      date: when,
      lien: link.url,
    });
    const sms = await sendSms({ to: lead.phoneE164, content: smsText, tag: 'rdv-confirmation' });
    await logNotification(tx, {
      channel: 'sms',
      template: 'appointment.confirmation',
      recipientMasked: maskPhone(lead.phoneE164),
      leadId: lead.id,
      appointmentId,
      status: sms.ok ? 'sent' : sms.skipped ? 'skipped' : 'failed',
      providerMessageId: sms.ok ? sms.messageId : null,
      error: sms.ok ? null : sms.error,
    });

    // Email au lead
    if (lead.email) {
      const html = renderEmail({
        brand: source.name,
        title: 'Votre rendez-vous est confirmé',
        bodyHtml: `<p>Bonjour ${esc(lead.firstName)},</p><p>Votre rendez-vous téléphonique avec <strong>${esc(buyer.name)}</strong>, expert certifié ORIAS, est confirmé le <strong>${esc(when)}</strong>.</p><p>Un empêchement ? Choisissez un autre moment plutôt que d’annuler :</p>`,
        cta: { label: 'Replanifier mon rendez-vous', url: link.url },
      });
      const email = await sendEmail({
        to: { email: lead.email, name: lead.firstName },
        subject: `Rendez-vous confirmé le ${when}`,
        html,
        tag: 'rdv-confirmation',
      });
      await logNotification(tx, {
        channel: 'email',
        template: 'appointment.confirmation',
        recipientMasked: maskEmail(lead.email),
        leadId: lead.id,
        appointmentId,
        status: email.ok ? 'sent' : email.skipped ? 'skipped' : 'failed',
        providerMessageId: email.ok ? email.messageId : null,
        error: email.ok ? null : email.error,
      });
    }

    // Email à l'acheteur avec la fiche (réponses + notes ; jamais de produit)
    const fiche = renderEmail({
      brand: source.name,
      title: `Nouveau rendez-vous : ${lead.firstName}, ${when}`,
      bodyHtml: `<p>Un rendez-vous vient d’être posé dans votre agenda.</p>
<p><strong>${esc(lead.firstName)}</strong> · ${esc(formatPhoneForDisplay(lead.phoneE164))}${lead.email ? ` · ${esc(lead.email)}` : ''}</p>
${answersTable(lead.answers)}
${appointment.setterNotes ? `<p style="margin-top:16px"><strong>Notes de l’appel de qualification :</strong><br>${esc(appointment.setterNotes).replace(/\n/g, '<br>')}</p>` : ''}
<p style="margin-top:16px;color:#8A8A94;font-size:13px">Vous recevrez après le rendez-vous un lien pour indiquer s’il a eu lieu et si le profil correspond à vos critères.</p>`,
      footer:
        'Données transmises avec le consentement explicite de la personne, dans le seul but de ce rendez-vous. Ne pas transférer.',
    });
    const buyerMail = await sendEmail({
      to: { email: buyer.contactEmail, name: buyer.contactName ?? buyer.name },
      subject: `Rendez-vous ${when} — ${lead.firstName}`,
      html: fiche,
      tag: 'rdv-fiche-acheteur',
    });
    await logNotification(tx, {
      channel: 'email',
      template: 'appointment.buyer_fiche',
      recipientMasked: maskEmail(buyer.contactEmail),
      leadId: lead.id,
      appointmentId,
      status: buyerMail.ok ? 'sent' : buyerMail.skipped ? 'skipped' : 'failed',
      providerMessageId: buyerMail.ok ? buyerMail.messageId : null,
      error: buyerMail.ok ? null : buyerMail.error,
    });
  });
};

const reminder: JobHandler = async (payload) => {
  const appointmentId = String(payload.appointmentId);
  const kind = payload.kind === 'h2' ? 'h2' : 'j1';
  await asSystem(async (tx) => {
    const found = await load(tx, appointmentId);
    if (!found || found.appointment.status !== 'pose') return;
    const { appointment, lead, buyer, source } = found;
    if (
      (kind === 'j1' && appointment.reminderJ1SentAt) ||
      (kind === 'h2' && appointment.reminderH2SentAt)
    )
      return;
    const link = await createSignedLink(tx, {
      purpose: 'reschedule',
      leadId: lead.id,
      appointmentId,
      buyerId: buyer.id,
      ttlHours: 48,
    });
    const text = renderTemplate(DEFAULT_REMINDER_SMS, {
      source: source.name,
      quand: kind === 'j1' ? 'demain' : 'dans 2 heures',
      expert: buyer.name,
      date: formatParis.long(appointment.scheduledAt),
      lien: link.url,
    });
    const sms = await sendSms({ to: lead.phoneE164, content: text, tag: `rdv-rappel-${kind}` });
    await logNotification(tx, {
      channel: 'sms',
      template: `appointment.reminder.${kind}`,
      recipientMasked: maskPhone(lead.phoneE164),
      leadId: lead.id,
      appointmentId,
      status: sms.ok ? 'sent' : sms.skipped ? 'skipped' : 'failed',
      providerMessageId: sms.ok ? sms.messageId : null,
      error: sms.ok ? null : sms.error,
    });
    await tx
      .update(appointments)
      .set(kind === 'j1' ? { reminderJ1SentAt: new Date() } : { reminderH2SentAt: new Date() })
      .where(eq(appointments.id, appointmentId));
    if (!sms.ok && !sms.skipped) throw new Error(sms.error);
  });
};

export function registerAppointmentJobs(): void {
  registerJob('appointment.confirmations', confirmations);
  registerJob('appointment.reminder', reminder);
}
