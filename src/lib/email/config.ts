/**
 * Configuration d'envoi email + garde-fou "mode test".
 * Tant que EMAIL_TEST_MODE = true, tout envoi est redirigé vers EMAIL_TEST_ADDRESS.
 */

export type EmailConfig = {
  testMode: boolean;
  testAddress: string;
  senderName: string;
  senderAddress: string;
};

export function getEmailConfig(): EmailConfig {
  return {
    // Par sécurité : mode test ACTIF par défaut (il faut explicitement EMAIL_TEST_MODE=false pour l'éteindre)
    testMode: process.env.EMAIL_TEST_MODE !== 'false',
    testAddress: process.env.EMAIL_TEST_ADDRESS ?? '',
    senderName: process.env.EMAIL_SENDER_NAME ?? 'SevenAtHome',
    senderAddress: process.env.EMAIL_SENDER_ADDRESS ?? 'newsletter@sevenathome.com',
  };
}
