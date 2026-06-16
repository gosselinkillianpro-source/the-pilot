import { describe, expect, it } from 'vitest';
import { classifyFreshness, formatAgo, STALE_MS } from '@/lib/sources/freshness';

const NOW = 1_700_000_000_000;

describe('classifyFreshness', () => {
  it('aucune donnée → down', () => {
    expect(classifyFreshness(null, NOW)).toBe('down');
  });
  it('donnée récente → ok', () => {
    expect(classifyFreshness(new Date(NOW - 60_000), NOW)).toBe('ok');
  });
  it('juste sous le seuil → ok', () => {
    expect(classifyFreshness(new Date(NOW - STALE_MS + 1000), NOW)).toBe('ok');
  });
  it('au-delà du seuil → stale', () => {
    expect(classifyFreshness(new Date(NOW - STALE_MS - 1000), NOW)).toBe('stale');
  });
});

describe('formatAgo', () => {
  it('null → tiret', () => expect(formatAgo(null, NOW)).toBe('—'));
  it('< 1 min → à l’instant', () =>
    expect(formatAgo(new Date(NOW - 30_000), NOW)).toBe("à l'instant"));
  it('minutes', () => expect(formatAgo(new Date(NOW - 5 * 60_000), NOW)).toBe('il y a 5 min'));
  it('heures', () => expect(formatAgo(new Date(NOW - 3 * 3_600_000), NOW)).toBe('il y a 3 h'));
  it('jours', () => expect(formatAgo(new Date(NOW - 2 * 86_400_000), NOW)).toBe('il y a 2 j'));
});
