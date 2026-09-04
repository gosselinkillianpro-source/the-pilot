import { describe, expect, test } from 'vitest';
import { isWithinDedupeWindow } from '@/lib/domain/dedupe';
import { maskEmail, maskPhone } from '@/lib/domain/mask';
import { newLeadAlertHtml, renderTemplate, slaEscalationHtml } from '@/lib/domain/messages';
import { formatMinutesAgo, slaColor } from '@/lib/domain/sla';

describe('messages', () => {
  test('alerte nouveau lead au format de la spec', () => {
    const html = newLeadAlertHtml({
      sourceName: 'MEP',
      firstName: 'Marc <b>',
      answers: { montant: '10k-50k', objectif: 'impots', urgence: '3mois' },
      url: 'https://lead.example/leads/1',
    });
    expect(html).toContain(
      '<b>Nouveau lead MEP</b> · Marc &lt;b&gt; · 10 – 50 k€ · Payer moins d’impôts · Dans les 3 mois',
    );
    expect(html).toContain('href="https://lead.example/leads/1"');
  });
  test('escalade niveau 2 en rouge', () => {
    const html = slaEscalationHtml(
      { sourceName: 'MEP', firstName: 'A', answers: {}, url: 'u' },
      31.4,
      2,
    );
    expect(html).toContain('🔴');
    expect(html).toContain('31 min');
  });
  test('renderTemplate remplace les clés connues et vide les autres', () => {
    expect(renderTemplate('Bonjour {prenom}, {inconnu}!', { prenom: 'Léa' })).toBe(
      'Bonjour Léa, !',
    );
  });
});

describe('petits utilitaires', () => {
  test('fenêtre de dédoublonnage 30 jours', () => {
    const now = new Date('2026-09-04T10:00:00Z');
    expect(isWithinDedupeWindow(new Date('2026-08-10T10:00:00Z'), now)).toBe(true);
    expect(isWithinDedupeWindow(new Date('2026-08-04T10:00:00Z'), now)).toBe(false);
  });
  test('masquage', () => {
    expect(maskPhone('+33612345678')).toBe('+336••••••78');
    expect(maskEmail('killian@breach.app')).toBe('k•••@breach.app');
  });
  test('couleur du chrono', () => {
    expect(slaColor(3, 5, 10)).toBe('green');
    expect(slaColor(7, 5, 10)).toBe('orange');
    expect(slaColor(12, 5, 10)).toBe('red');
    expect(formatMinutesAgo(0.5)).toBe('à l’instant');
    expect(formatMinutesAgo(125)).toBe('il y a 2 h');
  });
});
