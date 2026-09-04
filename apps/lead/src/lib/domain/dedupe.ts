/** Fenêtre de dédoublonnage : même téléphone, même source, 30 jours (section 4.1). */
export const DEDUPE_WINDOW_DAYS = 30;

export function isWithinDedupeWindow(previousReceivedAt: Date, now: Date): boolean {
  const ms = now.getTime() - previousReceivedAt.getTime();
  return ms >= 0 && ms < DEDUPE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
