'use server';

import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { AuthError, getAuthenticatedUser, scopeFor } from '@/lib/auth';
import { campaigns, leads } from '@/lib/db/schema';
import { withDbSession } from '@/lib/db/session';
import { labelFor, questionLabel } from '@/lib/domain/answers/mep';
import { STATE_LABELS } from '@/lib/domain/state-machine';

export type ExportResult = { ok: true; csv: string } | { ok: false; error: string };

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Export CSV de leads (admin) : données personnelles → journalisé dans audit_log. */
export async function exportLeadsCsvAction(ids: string[]): Promise<ExportResult> {
  try {
    const user = await getAuthenticatedUser();
    if (user.role !== 'admin') return { ok: false, error: 'Export réservé à l’admin.' };
    const parsed = z.array(z.string().uuid()).min(1).max(500).safeParse(ids);
    if (!parsed.success) return { ok: false, error: 'Sélection invalide.' };
    const rows = await withDbSession(scopeFor(user), (tx) =>
      tx
        .select({ lead: leads, campaignName: campaigns.name })
        .from(leads)
        .leftJoin(campaigns, eq(campaigns.id, leads.campaignId))
        .where(inArray(leads.id, parsed.data)),
    );
    const answerKeys = [...new Set(rows.flatMap((r) => Object.keys(r.lead.answers)))].filter(
      (k) => k !== 'form_type',
    );
    const header = [
      'id',
      'prenom',
      'telephone',
      'email',
      'statut',
      'campagne',
      'recu_le',
      'premier_appel',
      'delai_min',
      ...answerKeys.map(questionLabel),
    ];
    const lines = rows.map((r) =>
      [
        r.lead.id,
        r.lead.firstName,
        r.lead.phoneE164,
        r.lead.email ?? '',
        STATE_LABELS[r.lead.state],
        r.campaignName ?? '',
        r.lead.receivedAt.toISOString(),
        r.lead.firstCallAt?.toISOString() ?? '',
        r.lead.slaMinutesEffective ?? '',
        ...answerKeys.map((k) => labelFor(k, r.lead.answers[k])),
      ]
        .map(csvCell)
        .join(';'),
    );
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'leads.export_csv',
      objectType: 'lead',
      objectId: null,
      metadata: { count: rows.length, ids: parsed.data },
    });
    return { ok: true, csv: `﻿${[header.map(csvCell).join(';'), ...lines].join('\n')}` };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: 'Session expirée.' };
    console.error('[leads.export]', e);
    return { ok: false, error: 'Export impossible.' };
  }
}
