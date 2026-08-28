import { describe, expect, test } from 'vitest';
import {
  buildAlertMessage,
  MAX_LEAD_AGE_MINUTES,
  type NewLead,
  parisHour,
  shouldAlert,
  telLink,
} from '@/lib/leads/new-lead-alert';

/** Un mardi de septembre, 14 h heure de Paris. */
const MIDI = new Date('2026-09-15T12:00:00Z');

function lead(over: Partial<NewLead> = {}): NewLead {
  return {
    investorId: '11111111-1111-1111-1111-111111111111',
    sahId: '9001',
    fullName: 'Claire Sibille',
    email: 'claire@example.com',
    phone: '0612345678',
    bonusCode: 'SEVEN-BREACH',
    city: 'Lyon',
    createdAt: new Date(MIDI.getTime() - 2 * 60_000),
    ...over,
  };
}

describe('heure locale', () => {
  test('lit l’heure de Paris, pas celle du serveur', () => {
    // Le serveur tourne en UTC (Render Frankfurt) ; en septembre, Paris est à +2.
    expect(parisHour(new Date('2026-09-15T12:00:00Z'))).toBe(14);
    expect(parisHour(new Date('2026-09-15T05:30:00Z'))).toBe(7);
    // En hiver, +1 seulement : le décalage ne doit pas être codé en dur.
    expect(parisHour(new Date('2026-01-15T12:00:00Z'))).toBe(13);
  });
});

describe('faut-il alerter', () => {
  test('un inscrit tout frais en journée : oui', () => {
    expect(shouldAlert(lead(), MIDI)).toEqual({ send: true });
  });

  test('la nuit, on ne réveille personne', () => {
    // 3 h du matin heure de Paris : le closer ne rappellera pas mieux, et
    // l'inscrit ne décrochera pas non plus.
    const nuit = new Date('2026-09-15T01:00:00Z');
    const res = shouldAlert(lead({ createdAt: new Date(nuit.getTime() - 60_000) }), nuit);
    expect(res.send).toBe(false);
  });

  test('tôt le matin (7 h) : pas encore', () => {
    const tot = new Date('2026-09-15T05:00:00Z');
    expect(shouldAlert(lead({ createdAt: tot }), tot).send).toBe(false);
  });

  test('8 h pile : on peut y aller', () => {
    const huitHeures = new Date('2026-09-15T06:00:00Z');
    expect(shouldAlert(lead({ createdAt: huitHeures }), huitHeures)).toEqual({ send: true });
  });

  test('une inscription trop ancienne ne fait plus sonner un téléphone', () => {
    const vieux = lead({
      createdAt: new Date(MIDI.getTime() - (MAX_LEAD_AGE_MINUTES + 60) * 60_000),
    });
    const res = shouldAlert(vieux, MIDI);
    expect(res.send).toBe(false);
    if (!res.send) expect(res.reason).toContain('vieille');
  });

  test('sans téléphone, l’alerte « rappelle vite » n’a pas d’objet', () => {
    const res = shouldAlert(lead({ phone: null }), MIDI);
    expect(res.send).toBe(false);
    if (!res.send) expect(res.reason).toContain('téléphone');
  });

  test('chaque refus dit pourquoi — jamais de silence', () => {
    const nuit = new Date('2026-09-15T01:00:00Z');
    const res = shouldAlert(lead({ createdAt: nuit }), nuit);
    if (!res.send) expect(res.reason.length).toBeGreaterThan(0);
  });
});

describe('numéro cliquable', () => {
  test('un 06 français devient un numéro international', () => {
    expect(telLink('0612345678')).toBe('+33612345678');
  });

  test('les espaces et points de saisie sont nettoyés', () => {
    expect(telLink('06 12 34 56 78')).toBe('+33612345678');
    expect(telLink('06.12.34.56.78')).toBe('+33612345678');
  });

  test('un numéro déjà international est laissé tel quel', () => {
    expect(telLink('+32475123456')).toBe('+32475123456');
  });

  test('le préfixe 00 devient +', () => {
    expect(telLink('0033612345678')).toBe('+33612345678');
  });
});

describe('le message poussé', () => {
  const APP = 'https://pilot.example.com';

  test('porte le nom, le numéro cliquable et le lien vers la fiche', () => {
    const msg = buildAlertMessage(lead(), MIDI, APP);
    expect(msg).toContain('Claire Sibille');
    expect(msg).toContain('tel:+33612345678');
    expect(msg).toContain(`${APP}/closing/investor/11111111-1111-1111-1111-111111111111`);
  });

  test('dit depuis quand la personne attend', () => {
    expect(buildAlertMessage(lead(), MIDI, APP)).toContain('il y a 2 min');
    const instant = lead({ createdAt: MIDI });
    expect(buildAlertMessage(instant, MIDI, APP)).toContain("à l'instant");
  });

  test('sans nom, l’e-mail sert d’identité — jamais de message vide', () => {
    const msg = buildAlertMessage(lead({ fullName: null }), MIDI, APP);
    expect(msg).toContain('claire@example.com');
  });

  test('un nom avec un caractère spécial ne casse pas le message', () => {
    // Telegram en mode HTML : un « & » ou un « < » non échappé fait rejeter
    // tout le message par l'API, donc pas d'alerte du tout.
    const msg = buildAlertMessage(lead({ fullName: 'Durand & Fils <SARL>' }), MIDI, APP);
    expect(msg).toContain('Durand &amp; Fils &lt;SARL&gt;');
    expect(msg).not.toContain('Durand & Fils <SARL>');
  });
});
