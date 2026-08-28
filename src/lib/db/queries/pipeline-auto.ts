import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { linkContactsToInvestors } from '@/lib/webinars/sync';

/**
 * Rangement automatique des tableaux de suivi d'après les FAITS venus de SAH.
 *
 * Un closer ne devrait pas avoir à déplacer une carte pour dire ce que la base
 * sait déjà : quelqu'un qui souscrit après son appel a investi, point. Ces
 * mouvements se déclenchent à chaque synchro SAH (horaire), juste après
 * l'import des souscriptions et des statuts.
 *
 * ⚠️ Toujours « après l'entrée dans le suivi ». Un investisseur qui avait déjà
 * placé 50 000 € six mois avant qu'on l'appelle ne doit pas atterrir dans
 * « A investi » à cause de cet argent-là : la colonne dirait alors que l'appel
 * a converti, ce qui est faux. Seul l'argent postérieur à l'entrée compte.
 *
 * ⚠️ Un fait prime sur un classement humain : une personne rangée
 * « Injoignable » qui finit par souscrire remonte en « A investi ». C'est un
 * constat, pas une opinion — et laisser 20 000 € dans la colonne des perdus
 * fausserait la lecture du tableau.
 *
 * Les trois jalons suivis sont ceux que SAH connaît et nous pas : l'INSCRIPTION
 * (le compte existe enfin), le KYC (la personne peut investir), la SOUSCRIPTION
 * (elle l'a fait). Un closer n'a pas à recopier ces trois-là à la main.
 */

export type AutoMoveResult = {
  /** Fiches rattachées à un compte SAH créé après l'échange. */
  linkedToSah: number;
  /** Cartes du suivi des appels passées en « A investi ». */
  closingInvested: number;
  /** Cartes du suivi webinaire passées en « A investi ». */
  webinarInvested: number;
  /** Cartes du suivi webinaire passées en « Compte finalisé » (KYC validé). */
  webinarAccountReady: number;
};

/** Souscriptions non annulées, datées comme partout ailleurs dans l'app. */
const SIGNED_REF = sql`coalesce(s.signed_at, s.paid_at, s.created_at)`;

export async function applyAutomaticMoves(): Promise<AutoMoveResult> {
  // 0. RATTACHEMENT — quelqu'un rencontré en rendez-vous ou inscrit à un
  //    webinaire qui crée SON COMPTE ensuite doit être relié à sa fiche SAH.
  //    Cette fonction ne tournait qu'après la synchro webinaire ; côté RDV,
  //    une personne qui s'inscrivait restait éternellement « pas de compte
  //    SAH » à l'écran, et aucun jalon suivant ne pouvait la faire avancer.
  const linkedToSah = await linkContactsToInvestors();
  // 1. Suivi des appels : a souscrit depuis son entrée dans le tableau.
  const closing = await db.execute(sql`
    update investors i
    set pipeline_stage = 'closed_won',
        pipeline_stage_updated_at = now(),
        updated_at = now()
    where i.deleted_at is null
      and i.pipeline_stage <> 'new'
      and i.pipeline_stage <> 'closed_won'
      and exists (
        select 1 from subscriptions s
        where s.investor_id = i.id
          and s.status <> 'cancelled'
          and ${SIGNED_REF} > coalesce(i.pipeline_entered_at, i.pipeline_stage_updated_at)
      )
    returning i.id
  `);

  // 2. Suivi webinaire : même règle, sur la fiche contact.
  const webinar = await db.execute(sql`
    update rdv_contacts c
    set pipeline_stage = 'invested',
        pipeline_stage_updated_at = now(),
        updated_at = now()
    where c.pipeline_stage is not null
      and c.pipeline_stage <> 'invested'
      and c.investor_id is not null
      and exists (
        select 1 from subscriptions s
        where s.investor_id = c.investor_id
          and s.status <> 'cancelled'
          and ${SIGNED_REF} > coalesce(c.pipeline_entered_at, c.pipeline_stage_updated_at)
      )
    returning c.id
  `);

  // 3. Suivi (webinaire ET rendez-vous) : KYC validé côté SAH → la personne
  //    PEUT investir. On avance depuis les colonnes qui précèdent ce jalon ;
  //    une carte « A investi » ou « Perdu », elle, ne bouge plus.
  const ready = await db.execute(sql`
    update rdv_contacts c
    set pipeline_stage = 'account_ready',
        pipeline_stage_updated_at = now(),
        updated_at = now()
    from investors i
    where i.id = c.investor_id
      and i.onboarding_complete
      and c.pipeline_stage in ('taken', 'called', 'interested')
    returning c.id
  `);

  return {
    linkedToSah,
    closingInvested: (closing as unknown as unknown[]).length,
    webinarInvested: (webinar as unknown as unknown[]).length,
    webinarAccountReady: (ready as unknown as unknown[]).length,
  };
}
