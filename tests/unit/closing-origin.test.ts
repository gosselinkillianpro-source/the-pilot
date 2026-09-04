import { describe, expect, test } from 'vitest';
import {
  investorOrigin,
  isAdCode,
  isThirdPartyCgp,
  type OriginInput,
  originGroup,
} from '@/lib/closing/origin';

function person(overrides: Partial<OriginInput>): OriginInput {
  return {
    bonusCode: null,
    breachLevel: null,
    parentSahId: null,
    cgpName: null,
    cgpNetwork: null,
    ...overrides,
  };
}

describe('isAdCode — même lecture que la page Ads', () => {
  test('SEVEN-BREACH* et *VIP* sont des codes pub, le reste non', () => {
    expect(isAdCode('SEVEN-BREACH')).toBe(true);
    expect(isAdCode('seven-breach-2')).toBe(true);
    expect(isAdCode('BREACH-VIP')).toBe(true);
    expect(isAdCode('Seven-club-deal-12')).toBe(false);
    expect(isAdCode('SEVEN-CD-3')).toBe(false);
  });
});

describe('investorOrigin', () => {
  test('un code pub → pub, même avec un parrain', () => {
    expect(investorOrigin(person({ bonusCode: 'SEVEN-BREACH', parentSahId: 'x' }))).toBe('ads');
  });

  test('BREACH direct sans code (niveau 0, parrain « SEVEN BREACH ») → pub', () => {
    expect(investorOrigin(person({ breachLevel: 0, parentSahId: 'seven-breach' }))).toBe('ads');
  });

  test('parrainé par un investisseur du réseau (niveau ≥ 1) → parrainage', () => {
    expect(investorOrigin(person({ breachLevel: 1, parentSahId: 'inv-42' }))).toBe('referral');
    expect(investorOrigin(person({ breachLevel: 2 }))).toBe('referral');
  });

  test('un parrain hors réseau BREACH → parrainage', () => {
    expect(investorOrigin(person({ parentSahId: 'inv-7' }))).toBe('referral');
  });

  test('un autre code, ou un vrai CGP tiers → partenaire', () => {
    expect(investorOrigin(person({ bonusCode: 'Seven-club-deal-12' }))).toBe('partner');
    expect(investorOrigin(person({ cgpName: 'Cabinet Martin' }))).toBe('partner');
    expect(investorOrigin(person({ cgpName: 'BREACH' }))).toBe('other');
    expect(investorOrigin(person({ cgpName: 'Guillaume Gosselin' }))).toBe('other');
  });

  test('sans code, sans parrain, sans CGP → venu seul', () => {
    expect(investorOrigin(person({}))).toBe('other');
    expect(investorOrigin(person({ bonusCode: '   ' }))).toBe('other');
  });
});

describe('originGroup — pubs contre tout le reste', () => {
  test('seule la pub est « pubs »', () => {
    expect(originGroup('ads')).toBe('ads');
    expect(originGroup('referral')).toBe('other');
    expect(originGroup('partner')).toBe('other');
    expect(originGroup('other')).toBe('other');
  });
});

describe('isThirdPartyCgp', () => {
  test('BREACH et Gosselin sont maison', () => {
    expect(isThirdPartyCgp('BREACH', null)).toBe(false);
    expect(isThirdPartyCgp(null, 'Réseau Gosselin')).toBe(false);
    expect(isThirdPartyCgp('Cabinet Martin', 'Réseau X')).toBe(true);
    expect(isThirdPartyCgp('', '  ')).toBe(false);
  });
});
