import { describe, expect, test } from 'vitest';
import { invitationBodyText, renderInvitationEmail } from '@/lib/invitations/email';
import {
  generateInvitationToken,
  hashInvitationToken,
  INVITATION_TTL_DAYS,
  invitationExpiry,
  invitationStatus,
  invitationUrl,
  looksLikeInvitationToken,
} from '@/lib/invitations/token';

const NOW = new Date('2026-09-07T10:00:00Z');

describe('jeton d’invitation', () => {
  test('aléatoire, sûr dans une URL, jamais deux fois le même', () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a).not.toBe(b);
    expect(looksLikeInvitationToken(a)).toBe(true);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test('l’empreinte est stable et ne révèle pas le jeton', () => {
    const t = generateInvitationToken();
    expect(hashInvitationToken(t)).toBe(hashInvitationToken(t));
    expect(hashInvitationToken(t)).toHaveLength(64);
    expect(hashInvitationToken(t)).not.toContain(t);
  });

  test('un jeton mal formé est refusé avant la base', () => {
    expect(looksLikeInvitationToken('')).toBe(false);
    expect(looksLikeInvitationToken('abc')).toBe(false);
    expect(looksLikeInvitationToken("' or 1=1 --")).toBe(false);
  });

  test('valable 7 jours', () => {
    expect(INVITATION_TTL_DAYS).toBe(7);
    expect(invitationExpiry(NOW).toISOString()).toBe('2026-09-14T10:00:00.000Z');
  });

  test('le lien pointe sur /invitation/<jeton>, sans double slash', () => {
    expect(invitationUrl('https://pilot.example/', 'abc')).toBe(
      'https://pilot.example/invitation/abc',
    );
  });
});

describe('état d’une invitation', () => {
  const base = { expiresAt: new Date('2026-09-14T10:00:00Z'), acceptedAt: null, revokedAt: null };
  test('en attente tant qu’elle n’est ni acceptée, ni annulée, ni expirée', () => {
    expect(invitationStatus(base, NOW)).toBe('pending');
  });
  test('acceptée prime sur tout', () => {
    expect(invitationStatus({ ...base, acceptedAt: NOW, revokedAt: NOW }, NOW)).toBe('accepted');
  });
  test('annulée, puis expirée', () => {
    expect(invitationStatus({ ...base, revokedAt: NOW }, NOW)).toBe('revoked');
    expect(invitationStatus(base, new Date('2026-09-14T10:00:00Z'))).toBe('expired');
  });
});

describe('e-mail d’invitation', () => {
  const input = {
    fullName: 'Dimitri Starodouboff',
    email: 'd.starodouboff@sevenathome.com',
    role: 'closer',
    inviterName: 'Killian',
    url: 'https://pilot.example/invitation/tok',
    expiresAt: new Date('2026-09-14T10:00:00Z'),
  };
  test('nomme la personne, le rôle, l’identifiant et le bouton', () => {
    const text = invitationBodyText(input);
    expect(text).toContain('Bonjour Dimitri');
    expect(text).toContain('closer');
    expect(text).toContain(input.email);
    const html = renderInvitationEmail(input);
    expect(html).toContain('Choisir mon mot de passe');
    expect(html).toContain(input.url);
  });
  test('sans nom, le prénom vient de l’adresse', () => {
    expect(
      invitationBodyText({ ...input, fullName: null, email: 'a.rafiie@sevenathome.com' }),
    ).toContain('Bonjour Rafiie');
  });
  test('ne contient aucun terme interdit AMF ni promesse', () => {
    const text = invitationBodyText(input).toLowerCase();
    for (const banned of ['garanti', 'sans risque', 'sûr', 'certain', 'assuré']) {
      expect(text).not.toContain(banned);
    }
  });
});
