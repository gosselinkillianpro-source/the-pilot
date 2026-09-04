import { describe, expect, test } from 'vitest';
import {
  missionForBucket,
  type RelationshipInput,
  relationshipState,
} from '@/lib/closing/relationship-state';

const NOW = new Date('2026-09-04T12:00:00Z');

function input(overrides: Partial<RelationshipInput>): RelationshipInput {
  return {
    hasSubscription: false,
    onboardingComplete: false,
    stage: 'contacted',
    reachedCount: 0,
    missedAttempts: 0,
    nextActionAt: null,
    lastOutcome: null,
    now: NOW,
    ...overrides,
  };
}

describe('relationshipState — l’état se déduit des faits', () => {
  test('une souscription fait un client, même si quelqu’un avait cliqué « perdu »', () => {
    expect(relationshipState(input({ hasSubscription: true, stage: 'closed_lost' }))).toBe(
      'client',
    );
  });

  test('perdu : étape close, faux numéro ou profil incompatible', () => {
    expect(relationshipState(input({ stage: 'closed_lost' }))).toBe('lost');
    expect(relationshipState(input({ lastOutcome: 'wrong_number' }))).toBe('lost');
    expect(relationshipState(input({ lastOutcome: 'profile_incompatible' }))).toBe('lost');
  });

  test('RDV prévu prime sur le reste', () => {
    expect(relationshipState(input({ stage: 'meeting_booked', onboardingComplete: true }))).toBe(
      'meeting',
    );
  });

  test('en pause : 3 tentatives, étape en sommeil, ou rappel à plus de 30 jours', () => {
    expect(relationshipState(input({ missedAttempts: 3 }))).toBe('paused');
    expect(relationshipState(input({ stage: 'dormant' }))).toBe('paused');
    expect(
      relationshipState(input({ nextActionAt: new Date('2026-10-20T10:00:00Z'), reachedCount: 1 })),
    ).toBe('paused');
    expect(
      relationshipState(input({ nextActionAt: new Date('2026-09-20T10:00:00Z'), reachedCount: 1 })),
    ).toBe('talking');
  });

  test('prêt à investir : KYC validé, rien investi', () => {
    expect(relationshipState(input({ onboardingComplete: true }))).toBe('ready');
    expect(relationshipState(input({ onboardingComplete: true, reachedCount: 2 }))).toBe('ready');
  });

  test('en discussion dès qu’on a été joint, ou étape avancée à la main', () => {
    expect(relationshipState(input({ reachedCount: 1 }))).toBe('talking');
    expect(relationshipState(input({ stage: 'interested' }))).toBe('talking');
    expect(relationshipState(input({ stage: 'proposal_sent' }))).toBe('talking');
  });

  test('à contacter : jamais joint, moins de 3 tentatives', () => {
    expect(relationshipState(input({}))).toBe('to_contact');
    expect(relationshipState(input({ missedAttempts: 2, stage: 'to_call_back' }))).toBe(
      'to_contact',
    );
  });
});

describe('missionForBucket', () => {
  test('chaque file du scoring a une mission, la relation par défaut', () => {
    expect(missionForBucket(1).key).toBe('first_call');
    expect(missionForBucket(2).key).toBe('thank');
    expect(missionForBucket(4).key).toBe('reinvest');
    expect(missionForBucket(5).key).toBe('kyc');
    expect(missionForBucket(42).key).toBe('relation');
  });
});
