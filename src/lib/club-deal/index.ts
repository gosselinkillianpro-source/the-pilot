import 'server-only';
import { db } from '@/lib/db';
import { queryableFrom } from './pg';
import { createClubDeal } from './service';

const DEFAULT_ORIGINS = 'https://www.sevenathome.com,https://sevenathome.com';

function csv(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function build() {
  const listId = Number(process.env.CLUB_DEAL_BREVO_LIST_ID);
  const senderEmail = process.env.CLUB_DEAL_SENDER_EMAIL?.trim();
  return createClubDeal({
    // Base de THE PILOT (DATABASE_URL). Jamais SAH_DATABASE_URL : SAH est en lecture seule.
    db: queryableFrom(db.$client),
    allowedOrigins: csv(process.env.CLUB_DEAL_ALLOWED_ORIGINS ?? DEFAULT_ORIGINS),
    brevo: {
      apiKey: process.env.BREVO_API_KEY?.trim() || undefined,
      sender: senderEmail
        ? { name: process.env.CLUB_DEAL_SENDER_NAME?.trim() || 'Seven At Home', email: senderEmail }
        : undefined,
      notifyTo: csv(process.env.CLUB_DEAL_NOTIFY_TO),
      replyTo: process.env.CLUB_DEAL_REPLY_TO?.trim() || undefined,
      listId: Number.isInteger(listId) && listId > 0 ? listId : undefined,
    },
    copy: { adminUrl: process.env.CLUB_DEAL_ADMIN_URL?.trim() ?? '' },
  });
}

const globalForClubDeal = globalThis as unknown as { __clubDeal?: ReturnType<typeof build> };

/** Instance unique : la limitation par IP vit en mémoire du processus. */
export function getClubDeal(): ReturnType<typeof build> {
  globalForClubDeal.__clubDeal ??= build();
  return globalForClubDeal.__clubDeal;
}
