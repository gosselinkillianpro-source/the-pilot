import { describe, expect, it } from 'vitest';
import { planProfileColumns } from '@/lib/integrations/sah/profile-columns';

const FULL = [
  'id',
  'user_id',
  'wallet_status',
  'lw_onboarding_status',
  'lw_onboarding_id',
  'kyc_validated_at',
  'account_id',
];

describe('planProfileColumns', () => {
  it('lit toutes les colonnes quand le schéma SAH est complet', () => {
    const plan = planProfileColumns(FULL);
    expect(plan.missingRequired).toEqual([]);
    expect(plan.missingOptional).toEqual([]);
    expect(plan.optional).toEqual({
      kyc_validated_at: 'kyc_validated_at',
      lw_onboarding_id: 'lw_onboarding_id',
      lemonway_account_id: 'account_id',
    });
  });

  it('lit null quand account_id disparaît (incident du 1er oct. 2026) sans bloquer', () => {
    const plan = planProfileColumns(FULL.filter((c) => c !== 'account_id'));
    expect(plan.missingRequired).toEqual([]);
    expect(plan.optional.lemonway_account_id).toBeNull();
    expect(plan.missingOptional).toEqual(['account_id']);
  });

  it('bloque quand une colonne du statut KYC manque', () => {
    const plan = planProfileColumns(FULL.filter((c) => c !== 'wallet_status'));
    expect(plan.missingRequired).toEqual(['wallet_status']);
  });

  it('bloque quand la table est introuvable (aucune colonne)', () => {
    const plan = planProfileColumns([]);
    expect(plan.missingRequired).toEqual(['user_id', 'wallet_status', 'lw_onboarding_status']);
  });
});
