import 'server-only';
import { eq } from 'drizzle-orm';
import { createSignedLink } from '@/lib/crypto/signed-links';
import { leadEvents, leads, sources } from '@/lib/db/schema';
import { asSystem, type Tx } from '@/lib/db/session';
import { maskPhone } from '@/lib/domain/mask';
import {
  attemptDueHtml,
  callbackDueHtml,
  DEFAULT_OFF_HOURS_SMS,
  DEFAULT_SLOT_SMS,
  type LeadSummary,
  newLeadAlertHtml,
  renderTemplate,
  slaEscalationHtml,
} from '@/lib/domain/messages';
import { nextState } from '@/lib/domain/state-machine';
import { formatParis } from '@/lib/domain/time';
import { appUrl } from '@/lib/env';
import { sendSms } from '@/lib/integrations/brevo/sms';
import { isTelegramConfigured, sendTelegram } from '@/lib/integrations/telegram';
import { alertRecipientsFor } from '@/lib/leads/recipients';
import { logNotification } from '@/lib/notifications/log';
import { type JobHandler, registerJob } from '../queue';

/**
 * Module B — alertes, chrono, escalades, relances (section 4.2).
 * Chaque handler relit l'état courant avant d'agir : un job rejoué ou en
 * retard ne doit jamais alerter pour un lead déjà rappelé.
 */

type LeadRow = typeof leads.$inferSelect;
type SourceRow = typeof sources.$inferSelect;

async function loadLead(
  tx: Tx,
  leadId: string,
): Promise<{ lead: LeadRow; source: SourceRow } | null> {
  const rows = await tx
    .select({ lead: leads, source: sources })
    .from(leads)
    .innerJoin(sources, eq(sources.id, leads.sourceId))
    .where(eq(leads.id, leadId))
    .limit(1);
  return rows[0] ?? null;
}

function summary(lead: LeadRow, source: SourceRow): LeadSummary {
  return {
    sourceName: source.name,
    firstName: lead.firstName,
    answers: lead.answers,
    url: `${appUrl()}/leads/${lead.id}`,
  };
}

async function broadcastTelegram(
  tx: Tx,
  sourceId: string,
  html: string,
  template: string,
  leadId: string,
  options: { includeAdmins?: boolean } = {},
): Promise<number> {
  const recipients = await alertRecipientsFor(tx, sourceId, {
    includeAdmins: options.includeAdmins ?? true,
  });
  if (!isTelegramConfigured() || recipients.length === 0) {
    await logNotification(tx, {
      channel: 'telegram',
      template,
      recipientMasked: recipients.length
        ? `${recipients.length} destinataire(s)`
        : 'aucun destinataire',
      leadId,
      status: 'skipped',
      error: isTelegramConfigured()
        ? 'aucun setter de garde avec Telegram'
        : 'TELEGRAM_BOT_TOKEN absent',
    });
    return 0;
  }
  let sent = 0;
  for (const r of recipients) {
    const res = await sendTelegram(r.telegramChatId, html);
    if (res.ok) sent++;
    await logNotification(tx, {
      channel: 'telegram',
      template,
      recipientMasked: r.email.replace(/^(.).*@/, '$1•••@'),
      leadId,
      userId: r.id,
      status: res.ok ? 'sent' : 'failed',
      error: res.ok ? null : res.error,
    });
  }
  return sent;
}

const leadAlert: JobHandler = async (payload) => {
  const leadId = String(payload.leadId);
  const offHours = Boolean(payload.offHours);
  await asSystem(async (tx) => {
    const found = await loadLead(tx, leadId);
    if (!found) return;
    const { lead, source } = found;
    if (lead.state !== 'a_rappeler' || lead.alertedAt) return;
    await broadcastTelegram(
      tx,
      source.id,
      newLeadAlertHtml(summary(lead, source), { offHours }),
      'lead.alert',
      leadId,
    );
    // Marqué même sans destinataire : le jour où un setter branche Telegram,
    // il ne doit pas recevoir d'un coup toutes les alertes en retard.
    await tx.update(leads).set({ alertedAt: new Date() }).where(eq(leads.id, leadId));
  });
};

const leadOffHoursSms: JobHandler = async (payload) => {
  const leadId = String(payload.leadId);
  const opening = payload.opening ? new Date(String(payload.opening)) : null;
  await asSystem(async (tx) => {
    const found = await loadLead(tx, leadId);
    if (!found) return;
    const { lead, source } = found;
    const text = renderTemplate(source.offHoursSms ?? DEFAULT_OFF_HOURS_SMS, {
      source: source.name,
      prenom: lead.firstName,
      reprise: opening ? formatParis.long(opening) : 'la reprise du service',
    });
    const res = await sendSms({ to: lead.phoneE164, content: text, tag: 'lead-hors-service' });
    await logNotification(tx, {
      channel: 'sms',
      template: 'lead.off_hours_sms',
      recipientMasked: maskPhone(lead.phoneE164),
      leadId,
      status: res.ok ? 'sent' : res.skipped ? 'skipped' : 'failed',
      providerMessageId: res.ok ? res.messageId : null,
      error: res.ok
        ? res.redirectedTo
          ? `redirigé vers ${maskPhone(res.redirectedTo)} (mode test)`
          : null
        : res.error,
    });
    if (!res.ok && !res.skipped) throw new Error(res.error);
  });
};

const leadSlaEscalate: JobHandler = async (payload, ctx) => {
  const leadId = String(payload.leadId);
  const level = Number(payload.level ?? 1);
  await asSystem(async (tx) => {
    const found = await loadLead(tx, leadId);
    if (!found) return;
    const { lead, source } = found;
    if (lead.firstCallAt || lead.state !== 'a_rappeler') return;
    const minutes = (ctx.now.getTime() - lead.receivedAt.getTime()) / 60000;
    await broadcastTelegram(
      tx,
      source.id,
      slaEscalationHtml(summary(lead, source), minutes, level),
      `lead.sla_escalate.${level}`,
      leadId,
      { includeAdmins: true },
    );
    await tx.update(leads).set({ slaAlertLevel: level }).where(eq(leads.id, leadId));
  });
};

const leadCallbackDue: JobHandler = async (payload, ctx) => {
  const leadId = String(payload.leadId);
  await asSystem(async (tx) => {
    const found = await loadLead(tx, leadId);
    if (!found) return;
    const { lead, source } = found;
    if (lead.state !== 'a_rappeler_plus_tard') return;
    const to = nextState(lead.state, 'callback_due');
    await tx.update(leads).set({ state: to, stateChangedAt: ctx.now }).where(eq(leads.id, leadId));
    await tx.insert(leadEvents).values({
      leadId,
      actorType: 'system',
      fromState: lead.state,
      toState: to,
      kind: 'callback_due',
      at: ctx.now,
    });
    await broadcastTelegram(
      tx,
      source.id,
      callbackDueHtml(summary(lead, source)),
      'lead.callback_due',
      leadId,
    );
  });
};

const leadAttemptDue: JobHandler = async (payload) => {
  const leadId = String(payload.leadId);
  const attempt = Number(payload.attempt ?? 2);
  await asSystem(async (tx) => {
    const found = await loadLead(tx, leadId);
    if (!found) return;
    const { lead, source } = found;
    if (lead.state !== 'a_rappeler') return;
    await broadcastTelegram(
      tx,
      source.id,
      attemptDueHtml(summary(lead, source), attempt),
      'lead.attempt_due',
      leadId,
    );
  });
};

const leadSlotSms: JobHandler = async (payload) => {
  const leadId = String(payload.leadId);
  await asSystem(async (tx) => {
    const found = await loadLead(tx, leadId);
    if (!found) return;
    const { lead, source } = found;
    if (!['a_rappeler', 'injoignable', 'en_appel'].includes(lead.state)) return;
    const link = await createSignedLink(tx, { purpose: 'slot_pick', leadId, ttlHours: 72 });
    const text = renderTemplate(DEFAULT_SLOT_SMS, {
      source: source.name,
      prenom: lead.firstName,
      lien: link.url,
    });
    const res = await sendSms({ to: lead.phoneE164, content: text, tag: 'lead-creneau' });
    await logNotification(tx, {
      channel: 'sms',
      template: 'lead.slot_sms',
      recipientMasked: maskPhone(lead.phoneE164),
      leadId,
      status: res.ok ? 'sent' : res.skipped ? 'skipped' : 'failed',
      providerMessageId: res.ok ? res.messageId : null,
      error: res.ok ? null : res.error,
    });
    if (!res.ok && !res.skipped) throw new Error(res.error);
  });
};

export function registerLeadJobs(): void {
  registerJob('lead.alert', leadAlert);
  registerJob('lead.off_hours_sms', leadOffHoursSms);
  registerJob('lead.sla_escalate', leadSlaEscalate);
  registerJob('lead.callback_due', leadCallbackDue);
  registerJob('lead.attempt_due', leadAttemptDue);
  registerJob('lead.slot_sms', leadSlotSms);
}
