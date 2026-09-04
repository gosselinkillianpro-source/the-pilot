# THE PILOT LEAD — Spécification produit et technique

*Version 1 · 3 septembre 2026 · Breach (Killian Gosselin)*

> Ce document décrit The Pilot Lead, le logiciel de Breach qui fait tourner l'usine à rendez-vous — un logiciel à part entière, distinct du Pilot de Seven At Home (section 0.1) : recevoir un lead, le faire rappeler en moins de cinq minutes, le qualifier, le router vers le bon acheteur, poser le rendez-vous dans son agenda, prouver la livraison, facturer, et renvoyer le résultat aux plateformes publicitaires. Il est écrit pour être codé : chaque module a ses règles, ses données et ses critères d'acceptation. Il est indépendant de la stack ; les choix techniques sont en section 10.

---

## 0. Périmètre et principes

**Ce que The Pilot Lead fait.** Il est le moteur entre les formulaires des marques de Breach (MonExpertPatrimoine aujourd'hui, d'autres demain) et les acheteurs de rendez-vous (CGP, cabinets, courtiers ORIAS). Il ne remplace ni le site, ni le Gestionnaire de publicités, ni l'agenda de l'acheteur : il les relie et il garde la preuve de chaque étape. C'est un logiciel de Breach, distinct de The Pilot (le CRM de Seven At Home) : voir la section 0.1.

**Ce qu'il ne fait pas.** Il ne conseille pas, ne recommande aucun produit, ne stocke aucune information sur les produits envisagés. Il n'y a pas de champ « produit » ni « partenaire recommandé » : c'est une règle de conformité (apporteur d'affaires non réglementé), pas un oubli.

**Multi-source, multi-acheteur dès le premier jour.** Une *source* est une marque de Breach qui envoie des leads (MEP aujourd'hui, d'autres marques demain). Un *acheteur* est un partenaire ORIAS qui reçoit des rendez-vous. Les données d'une source ne sont jamais visibles d'un acheteur d'une autre source. Rien de Seven At Home n'entre dans ce logiciel.

**Trois versions.** v0 en deux semaines pour le pilote (un acheteur par source, saisie manuelle acceptée à certains endroits). v1 pour les packs payants et le routage multi-acheteurs. v2 pour l'échelle (setters, agent vocal, SaaS). La section 9 détaille ce qui va dans chaque version. Tout ce qui est marqué **[v0]** est obligatoire pour lancer le pilote.

**Cinq invariants.** Un lead porte toujours sa source et son attribution (campagne, ad set, créa) sinon il est rejeté à l'entrée. Le chrono de rappel démarre à la réception et ne s'arrête qu'au premier appel sortant. Un rendez-vous n'est facturable que s'il est honoré et conforme, validé par l'acheteur ou tacitement après le délai. Un lead rejeté par un acheteur n'est jamais re-routé sans un nouveau consentement explicite. Tout changement d'état est journalisé avec son auteur et son horodatage.

### 0.1 Architecture : deux logiciels indépendants sur la même infrastructure

**Deux applications complètement séparées.** The Pilot (le CRM de Seven At Home) et The Pilot Lead (ce document, l'outil de MonExpertPatrimoine / Breach) sont deux logiciels distincts : deux dépôts, deux processus, deux URL (par exemple `app.thepilot.fr` et `app.monexpertpatrimoine.fr` ou `lead.breach.app`), **deux pages de connexion, deux systèmes de comptes**, des fonctions différentes. Rien n'est partagé au niveau applicatif : pas de portail commun, pas de session commune, pas de code commun obligatoire. Une panne, une migration ou une refonte de l'un ne touche jamais l'autre.

**Aucune donnée de Seven At Home dans The Pilot Lead.** The Pilot Lead ne collecte, ne lit et ne stocke rien de Seven At Home : pas de source `seven`, pas de leads Seven, pas d'acheteur Seven, pas d'utilisateur Stéphane ou Guillaume. Ses sources sont les marques de Breach (aujourd'hui `mep`, demain d'autres marques de Breach), et ses acheteurs sont les partenaires ORIAS de MEP. Ce sont deux entreprises distinctes et la séparation des données est une exigence, pas une option. Toute mention de `seven` ailleurs dans ce document est caduque : le webhook du module A ne sert qu'aux marques de Breach, et le champ `orias_number` des acheteurs est toujours obligatoire.

**Même serveur, même instance Postgres, bases cloisonnées.** Les deux applications tournent sur le même serveur, derrière le même reverse proxy, sur la même instance Postgres, pour ne payer et n'administrer qu'une infrastructure. Le cloisonnement est fait par la base : deux bases de données distinctes (ou deux schémas avec des rôles étanches), `pilot_db` et `lead_db`, chacune avec son propre rôle Postgres qui ne voit qu'elle. `app_lead` n'a aucun droit sur `pilot_db`, `app_pilot` n'a aucun droit sur `lead_db`. Sauvegardes séparées, restaurables indépendamment. Les secrets (clés API Meta, SMS, email) sont propres à chaque application ; The Pilot Lead utilise le Business Manager et le pixel de MEP, jamais ceux de Seven.

**Connexion à The Pilot Lead.** Sa propre page de connexion, ses propres comptes dans sa propre table `users` (section 3.13). Trois types de comptes :
- Killian : `admin`, voit tout The Pilot Lead, y compris tous les comptes acheteurs.
- Setter : rôle `setter`, périmètre = une ou plusieurs sources de Breach.
- Acheteur : rôle `buyer`, périmètre = **un seul** `buyer_id` ; connexion par lien magique en v0, mot de passe en v1. Il ne voit ni les autres acheteurs, ni les leads non routés, ni les campagnes, ni le tableau du lundi.

Killian a par ailleurs son compte sur The Pilot, comme aujourd'hui : deux logiciels, deux connexions, et c'est voulu.

**L'isolation des acheteurs est garantie par la base.** Les tables qui portent un `buyer_id` (`appointments`, `packs`, `invoices`, `buyer_users`) sont protégées par des politiques de *row-level security* Postgres : à chaque requête d'une session acheteur, l'application positionne `SET app.buyer_id = '<id>'`, et la politique `buyer_id = current_setting('app.buyer_id')` s'applique quoi que fasse le code ou l'URL. Une session admin ou setter positionne `app.role`, et la politique laisse passer selon le rôle. Un acheteur qui devine l'identifiant d'un rendez-vous d'un autre acheteur obtient un `404`, pas un `403` (on ne confirme pas l'existence).

**Killian voit les comptes acheteurs.** Deux mécanismes, tous deux journalisés :
- *Vue admin* : un écran « Acheteurs » liste tous les comptes avec leurs RDV, packs, factures, taux de validation et retours ; c'est la vue de pilotage, sans changer d'identité.
- *Voir en tant que* : depuis la fiche d'un acheteur, l'admin ouvre le portail acheteur exactement comme l'acheteur le voit (support). Cette session d'impersonation est enregistrée dans `impersonations` (admin, acheteur, début, fin, actions), affiche un bandeau permanent « Vous voyez le compte de X », est en lecture seule par défaut, et exige une confirmation explicite pour chaque écriture, alors attribuée à l'admin dans `lead_events` (`actor_type = admin`, `on_behalf_of = buyer_id`).

**Ce que ça change dans ce document.** Les intégrations de la section 6 perdent la ligne « Formulaires Seven ». La section 10 perd la migration de Seven : The Pilot actuel continue sa vie telle quelle, et The Pilot Lead naît vide, avec la seule source `mep`. Les critères d'acceptation de la section 8 gagnent trois vérifications (11, 12, 13).

---

## 1. Glossaire

| Terme | Définition |
|---|---|
| **Source** | Marque de Breach qui envoie des leads : `mep` aujourd'hui, d'autres marques de Breach demain. Possède ses campagnes, ses leads et ses acheteurs autorisés. |
| **Campagne / ad set / créa** | Les trois niveaux d'attribution Meta, capturés via les UTM et l'identifiant de clic (`fbclid`). Le nom de campagne est la clé de tout le reporting. |
| **Lead** | Une personne qui a complété un formulaire d'une marque de Breach (le diagnostic MEP), avec ses réponses, son consentement et son attribution. |
| **Qualification** | Le résultat de l'appel de rappel : critères vérifiés, score, disposition (RDV posé, à rappeler, à nourrir, hors cible, injoignable). |
| **Acheteur** | Partenaire ORIAS qui reçoit des rendez-vous : critères d'acceptation, plafonds, agenda, prix, pack. |
| **Rendez-vous (RDV)** | Un créneau posé dans l'agenda d'un acheteur pour un lead qualifié. Passe par : posé → honoré / absent → conforme / non conforme → suite. |
| **Validation** | L'acheteur indique sous 48 h si le RDV a été honoré et s'il est conforme aux critères. Sans réponse : validation tacite (configurable). |
| **Conforme** | Honoré et dans les critères écrits de l'acheteur. Seul un RDV conforme est facturable. |
| **Pack** | Un lot de N rendez-vous conformes prépayés par un acheteur. Se décrémente à chaque validation. |
| **Retour** | Un RDV non conforme accepté comme tel : il n'est pas facturé et un remplacement est dû. |
| **Événement de conversion** | Signal renvoyé à Meta (Lead, Schedule, RDV_Honore, RDV_Conforme, Signe) pour optimiser l'algorithme sur la qualité. |
| **Setter** | Personne qui rappelle et qualifie. En v0, c'est Killian. |

---

## 2. Le parcours d'un lead et sa machine à états

### 2.1 États

```
NOUVEAU ──(alerte envoyée)──▶ À_RAPPELER ──(appel sortant)──▶ EN_APPEL
                                   │                              │
                                   │ (3 tentatives échouées)      ├──▶ QUALIFIÉ ──▶ RDV_POSÉ
                                   ▼                              ├──▶ À_RAPPELER_PLUS_TARD (date) ──▶ À_RAPPELER
                              INJOIGNABLE                         ├──▶ À_NOURRIR (curiosité, < seuil montant)
                                                                  └──▶ HORS_CIBLE (motif)

RDV_POSÉ ──(date passée + validation acheteur ou tacite)──▶ HONORÉ ──▶ CONFORME ──▶ SUITE : EN_COURS / SIGNÉ / PERDU
                                                              │           └──▶ NON_CONFORME (motif) ──▶ RETOUR_ACCEPTÉ / RETOUR_REFUSÉ
                                                              └──▶ ABSENT ──▶ REPROGRAMMÉ (nouveau RDV) / PERDU
```

### 2.2 Règles de transition

- `NOUVEAU → À_RAPPELER` : automatique à la réception, après validation du payload et dédoublonnage. Déclenche l'alerte (module B). Le chrono `sla_timer` démarre à `received_at`.
- `À_RAPPELER → EN_APPEL` : le setter clique « J'appelle » sur la fiche. `first_call_at` est fixé une seule fois (le premier clic), c'est lui qui sert au délai de rappel.
- `EN_APPEL → QUALIFIÉ` : tous les critères obligatoires de la catégorie d'acheteur sont cochés « oui » et le score ≥ seuil. Sinon `HORS_CIBLE` avec un motif obligatoire.
- `EN_APPEL → À_NOURRIR` : le lead a répondu « je me renseigne » ou son montant est sous le seuil minimum de tous les acheteurs actifs. Il sort du flux téléphonique, entre dans une séquence email (hors périmètre v0, export vers Brevo).
- `À_RAPPELER → INJOIGNABLE` : après 3 tentatives horodatées (règle : +30 min, +3 h, lendemain 10 h heure de Paris). Un SMS est envoyé après la deuxième tentative avec un lien de prise de créneau.
- `QUALIFIÉ → RDV_POSÉ` : un créneau a été créé dans l'agenda d'un acheteur (module D) via le routage (module E). Un lead qualifié sans acheteur disponible reste `QUALIFIÉ` dans une file « à router manuellement » avec alerte admin.
- `RDV_POSÉ → HONORÉ / ABSENT` : renseigné par l'acheteur dans son portail (module F). Si aucune réponse à `scheduled_at + validation_delay` (48 h par défaut) et que la validation tacite est activée pour cet acheteur, le RDV passe `HONORÉ` + `CONFORME` avec `validated_tacitly = true`.
- `HONORÉ → CONFORME / NON_CONFORME` : renseigné par l'acheteur avec un motif obligatoire pour non conforme (liste fermée : `faux_numero`, `montant_hors_criteres`, `timing_hors_criteres`, `doublon`, `deja_client`, `autre`). `NON_CONFORME` ouvre une demande de retour, tranchée par l'admin (`RETOUR_ACCEPTÉ` = remplacement dû, non facturé ; `RETOUR_REFUSÉ` = facturé).
- `CONFORME → SUITE` : l'acheteur met à jour `EN_COURS / SIGNÉ / PERDU` quand il veut ; `SIGNÉ` déclenche l'événement de conversion `Signe`.
- Tout état est journalisé dans `lead_events` (qui, quand, de quel état vers quel état, commentaire).

### 2.3 Délais et horaires

- Fuseau de référence : `Europe/Paris` pour tout ce qui est affiché et pour les règles horaires ; stockage en UTC.
- Heures de service du rappel : configurables par source (défaut 9 h – 20 h, lundi–samedi). Un lead reçu hors service reste `À_RAPPELER` avec un SMS automatique immédiat (« nous vous rappelons demain à partir de 9 h ») et l'alerte est envoyée à l'ouverture. Le délai de rappel mesuré pour le reporting exclut les heures hors service (`sla_minutes_effective`).
- Le délai cible est 5 minutes, le seuil d'alerte 10 minutes (paramètre global, modifiable).

---

## 3. Modèle de données

Toutes les tables ont `id` (uuid), `created_at`, `updated_at`. Les champs personnels (`phone`, `email`, `first_name`, `last_name`) sont chiffrés au repos. Les tables sont listées avec leurs champs essentiels ; les types sont indicatifs (Postgres).

### 3.1 `sources`
`code` (unique : `mep`, puis les futures marques de Breach), `name`, `default_timezone`, `service_hours` (json : jours et plages), `webhook_secret`, `sla_target_min` (5), `sla_alert_min` (10), `nurture_export_target` (`brevo` | `none`), `active`.

### 3.2 `campaigns`
`source_id`, `platform` (`meta` | `google` | `organic` | `other`), `external_id` (id de campagne Meta, nullable), `name` (clé de reporting, exactement le nom du Gestionnaire), `adset_name`, `ad_name`, `active`. Contrainte d'unicité `(source_id, name, adset_name, ad_name)`. Créées automatiquement à la première apparition d'un triplet UTM inconnu.

### 3.3 `leads`
- Identité : `source_id`, `first_name`, `phone_e164` (normalisé, index), `email` (index), `locale`.
- Réponses : `answers` (jsonb, telles que reçues : objectif, tranche de montant, horizon, impôt, situation, timing…), `answers_version` (version du formulaire).
- Consentement : `consent_text` (texte exact affiché), `consent_version`, `consent_at`, `consent_ip_hash`, `consent_user_agent`, `consent_partner_transfer` (bool, doit être `true` pour tout routage).
- Attribution : `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` (ad set), `utm_term` (créa), `fbclid`, `fbc`, `fbp`, `landing_url`, `referrer`, `campaign_id` (résolu).
- Temps : `received_at`, `first_call_at` (immuable après le premier appel), `sla_minutes_effective` (calculé), `attempts_count`, `next_attempt_at`.
- Statut : `state` (enum de la section 2), `state_reason` (motif fermé), `nurture_reason`, `dedupe_of` (lead_id si doublon).
- Routage : `buyer_id` (nullable), `routed_at`, `reroute_consent_at` (nullable ; obligatoire pour un second routage).
- Divers : `idempotency_key` (unique par source), `raw_payload` (jsonb), `deleted_at` (soft delete RGPD).

### 3.4 `lead_events`
`lead_id`, `actor_type` (`system` | `setter` | `buyer` | `admin`), `actor_id`, `from_state`, `to_state`, `payload` (jsonb), `at`. Append-only.

### 3.5 `call_attempts`
`lead_id`, `setter_id`, `started_at`, `ended_at`, `outcome` (`repondu` | `messagerie` | `occupe` | `faux_numero`), `notes`, `recording_url` (nullable, seulement si consentement à l'enregistrement).

### 3.6 `qualifications`
`lead_id` (unique), `setter_id`, `criteria` (jsonb : `{montant_ok: true, timing_ok: true, horizon_ok: true, impot_ok: null, …}`), `score` (int), `disposition` (`rdv_pose` | `rappeler` | `nourrir` | `hors_cible` | `injoignable`), `disposition_reason`, `notes`, `qualified_at`. **Aucun champ produit.**

### 3.7 `buyers`
`source_id` (un acheteur appartient à une source), `name`, `legal_name`, `orias_number` (obligatoire), `contact_email`, `contact_phone`, `criteria` (jsonb, voir 4.5), `daily_cap`, `weekly_cap`, `priority` (int, 1 = servi en premier), `exclusive` (bool, défaut `true`), `price_per_rdv_cents`, `currency`, `validation_delay_hours` (48), `tacit_validation_enabled` (bool ; **false** pendant le premier pack), `calendar_provider` (`calcom` | `google` | `calendly_link` | `manual`), `calendar_config` (jsonb), `timezone`, `active`, `paused_until`.

### 3.8 `buyer_users`
`buyer_id`, `email`, `role` (`owner` | `member`), `last_login_at`. Accès au portail (module F).

### 3.9 `appointments`
`lead_id`, `buyer_id`, `scheduled_at`, `duration_min`, `calendar_event_id`, `booking_url`, `status` (`pose` | `honore` | `absent` | `reprogramme` | `annule`), `conformity` (`null` | `conforme` | `non_conforme`), `non_conformity_reason` (liste fermée de 2.2), `validated_at`, `validated_by` (`buyer` | `tacit` | `admin`), `validation_due_at`, `outcome` (`null` | `en_cours` | `signe` | `perdu`), `outcome_at`, `return_status` (`null` | `demande` | `accepte` | `refuse`), `replacement_of` (appointment_id), `billable` (bool, calculé : `status = honore AND conformity = conforme AND return_status IS DISTINCT FROM 'accepte'`), `pack_id` (nullable), `reminder_j1_sent_at`, `reminder_h2_sent_at`.

### 3.10 `packs`
`buyer_id`, `size` (10), `price_cents_per_rdv`, `total_cents`, `prepaid` (bool), `paid_at`, `remaining` (décrémenté à chaque `billable = true`), `low_threshold` (2), `status` (`actif` | `epuise` | `clos`), `is_pilot` (bool : pack offert).

### 3.11 `invoices` et `invoice_lines`
`buyer_id`, `period_start`, `period_end`, `total_cents`, `status` (`brouillon` | `emise` | `payee`), `external_ref`. Lignes : `appointment_id`, `label`, `amount_cents`. Une ligne par RDV facturable du mois (mode mensuel) ou un décompte de pack (mode prépayé).

### 3.12 `conversion_events`
`lead_id`, `appointment_id` (nullable), `platform` (`meta`), `event_name` (`Lead` | `Schedule` | `RDV_Honore` | `RDV_Conforme` | `Signe`), `event_id` (unique, pour la déduplication côté Meta), `event_time`, `payload_hash`, `sent_at`, `response_status`, `error`. 

### 3.13 `users` et `roles`
`email`, `name`, `role` (`admin` | `setter` | `buyer`), `source_ids` ou `buyer_id` selon le rôle, `on_duty` (bool, pour les alertes), `phone_for_alerts`. Table propre à The Pilot Lead : rien de partagé avec The Pilot.

### 3.14 `weekly_metrics` (vue matérialisée ou table recalculée chaque nuit)
Par `(source_id, week_monday, campaign_id)` : `spend_cents` (saisi ou importé), `leads`, `cpl`, `rdv_poses`, `taux_prise`, `honores`, `taux_presence`, `conformes`, `taux_conformite`, `cout_par_rdv_conforme`, `signes`, `delai_moyen_min`, `alerts` (texte). C'est le tableau du lundi.

### 3.15 `audit_log`
Toute lecture ou export de données personnelles par un utilisateur : `user_id`, `action`, `object_type`, `object_id`, `at`. Nécessaire pour répondre à une demande RGPD.

---

## 4. Les modules et leurs règles

### 4.1 Module A — Réception **[v0]**

**Endpoint.** `POST /api/v1/leads` authentifié par `X-Source-Key` (le `webhook_secret` de la source). Idempotent via `idempotency_key` (renvoyer le même lead deux fois renvoie la même réponse, sans doublon).

**Payload minimal (exemple MEP) :**
```json
{
  "idempotency_key": "mep-2026-09-03T10:14:22Z-a8f3",
  "source": "mep",
  "first_name": "Marc",
  "phone": "06 12 34 56 78",
  "email": "marc@example.com",
  "answers": {
    "objectif": "impots",
    "montant": "10k-50k",
    "horizon": "5-10ans",
    "risque": "moderee",
    "situation_pro": "salarie",
    "impot_annuel": "5000-10000",
    "timing": "3mois",
    "age": "40-55",
    "patrimoine": "100k-250k",
    "situation_immo": "proprietaire",
    "revenus_foyer": "4000-6000"
  },
  "answers_version": "diagnostic-v3",
  "consent": {
    "text": "J'accepte que mes informations soient transmises à un ou plusieurs partenaires experts (conseillers en gestion de patrimoine, courtiers en assurance immatriculés ORIAS) afin d'être recontacté(e) dans le cadre de ma demande.",
    "version": "2026-08",
    "at": "2026-09-03T10:14:20Z",
    "ip": "203.0.113.4",
    "user_agent": "Mozilla/5.0 …"
  },
  "attribution": {
    "utm_source": "meta", "utm_medium": "paid", "utm_campaign": "MEP · Impôts · TMI30",
    "utm_content": "Salarié 40-55", "utm_term": "V2 · Témoignage",
    "fbclid": "IwAR…", "fbc": "fb.1.1725357260.IwAR…", "fbp": "fb.1.1725357000.123456",
    "landing_url": "https://monexpertpatrimoine.fr/diagnostic/?utm_…", "referrer": "https://l.facebook.com/"
  }
}
```

**Règles.**
- Rejet `422` si : téléphone non normalisable en E.164 français ou international, consentement absent ou `consent.text` vide, source inconnue, attribution sans `utm_campaign` **et** sans `fbclid` (un lead organique est accepté avec `utm_source = organic` explicite).
- Dédoublonnage : même `phone_e164` sur la même source dans les 30 jours → le nouveau lead est créé avec `dedupe_of` et l'état `HORS_CIBLE` motif `doublon`, sans alerte. Il reste visible pour le reporting (coût du doublon).
- Résolution de campagne : le triplet `(utm_campaign, utm_content, utm_term)` crée ou retrouve la ligne `campaigns`. Le nom est stocké tel quel, sans normalisation, pour rester identique au Gestionnaire.
- `received_at` = horodatage serveur à la réception, pas celui du client.
- Réponse `201` avec `lead_id` et `state`. Le site n'attend rien d'autre.
- Événement `Lead` envoyé à Meta CAPI immédiatement (module G) avec `event_id = lead_id`.

**Côté site MEP (à faire dans le site, pas dans The Pilot).** Champs cachés qui capturent les UTM et le `fbclid` à l'arrivée sur le site et les conservent en session jusqu'au diagnostic ; lecture des cookies `_fbc` et `_fbp` ; envoi du payload ci-dessus à la validation des coordonnées (étape 3 du diagnostic), puis mise à jour des réponses à la fin (`PATCH /api/v1/leads/{id}/answers`) pour que les 13 questions suivantes soient rattachées.

### 4.2 Module B — Alerte et chrono **[v0]**

- À la création d'un lead `À_RAPPELER` pendant les heures de service : SMS + notification push (ou Slack) au setter `on_duty`, contenant prénom, tranche de montant, objectif, timing et un lien direct vers la fiche d'appel. Modèle : « Nouveau lead MEP · Marc · 10-50K · impôts · 3 mois · [lien] ».
- Hors heures de service : pas d'alerte immédiate ; SMS au lead ; alerte envoyée à l'ouverture du service, dans l'ordre de réception.
- Escalade : si aucun `first_call_at` à `received_at + sla_alert_min`, seconde alerte au setter et à l'admin. À +30 min, troisième alerte.
- Chrono visible sur la fiche et dans la liste `À_RAPPELER` (« reçu il y a 3 min »), avec couleur : vert < 5 min, orange 5–10, rouge > 10.
- La liste `À_RAPPELER` est triée par `received_at` croissant, avec les leads hors service en tête à l'ouverture.

### 4.3 Module C — Qualification (fiche d'appel) **[v0]**

**Écran.** Une page par lead, ouverte depuis l'alerte : en-tête (prénom, téléphone cliquable, source, campagne, chrono), réponses du formulaire pré-remplies, bloc « critères » avec une case par critère de la catégorie d'acheteur, score calculé en direct, zone de notes, et six boutons de disposition.

**Critères et score.** Les critères sont définis par acheteur (4.5) mais la fiche affiche l'union des critères des acheteurs actifs de la source, avec pour chacun : `oui / non / non vérifié`. Le score est le nombre de critères obligatoires à `oui` ; un lead est `QUALIFIÉ` si tous les obligatoires d'au moins un acheteur actif sont à `oui`. Le calcul est fait côté serveur pour que le routage et la fiche soient cohérents.

**Dispositions.**
- « J'appelle » : fixe `first_call_at` (une seule fois), crée un `call_attempt`.
- « RDV posé » : ouvre le module D avec l'acheteur proposé par le routage.
- « Rappeler plus tard » : date et heure obligatoires, retour en `À_RAPPELER` à cette date.
- « À nourrir » : motif (`curiosite` | `montant_sous_seuil` | `pas_maintenant`), sortie du flux, export nurture.
- « Hors cible » : motif obligatoire (liste fermée).
- « Injoignable » : incrémente `attempts_count`, programme `next_attempt_at` selon la règle 2.2.

**Script.** La fiche affiche un script court en trois blocs (présentation, questions de capacité, prise de créneau) et une liste de phrases interdites (aucun produit, aucun partenaire nommé, aucune promesse). Le script est un texte configurable par source ; il n'est pas une donnée du lead.

**Enregistrement des appels.** Hors périmètre v0. Si activé plus tard : consentement oral horodaté obligatoire, stockage séparé, durée de conservation courte.

### 4.4 Module D — Agenda et confirmations **[v0 en mode lien, v1 en mode API]**

- **v0 (`calendly_link` ou `manual`)** : la fiche affiche le lien de prise de rendez-vous de l'acheteur ; le setter pose le créneau pendant l'appel et saisit `scheduled_at` dans The Pilot (ou le webhook Calendly le remplit). Les UTM sont passés au lien de réservation en paramètres pour les retrouver dans le webhook.
- **v1 (`calcom` ou `google`)** : lecture des disponibilités de l'acheteur (API), affichage des trois prochains créneaux, création de l'événement avec le lead en invité, insertion de la fiche du lead (réponses + notes) dans la description de l'événement.
- Confirmations : SMS et email au lead avec date, heure, nom de l'acheteur et lien de replanification ; email à l'acheteur avec la fiche.
- Rappels au lead : J-1 à 18 h et H-2, SMS. Un lien « je ne pourrai pas venir » qui reprogramme (nouveau créneau) plutôt que d'annuler.
- `ABSENT` renseigné par l'acheteur ; une reprogrammation crée un nouveau `appointment` avec `replacement_of`, l'ancien passe `reprogramme` et n'est jamais facturable.

### 4.5 Module E — Routage **[v0 minimal, v1 complet]**

**Critères d'un acheteur (`buyers.criteria`, exemple) :**
```json
{
  "montant_min": "10k-50k",
  "objectifs": ["impots", "retraite", "fructifier"],
  "timing_max": "annee",
  "impot_min": "2500-5000",
  "zones": ["FR"],
  "exclusions": {"situation_pro": ["retraite"]},
  "obligatoires": ["montant_min", "timing_max"]
}
```
Les valeurs sont celles des réponses du formulaire (tranches ordonnées, définies dans `answers_version`). `obligatoires` liste les critères qui doivent être satisfaits pour que le lead soit routable vers cet acheteur ; les autres pondèrent la priorité.

**Algorithme (à chaque « RDV posé »).**
1. Candidats = acheteurs de la même source, `active = true`, non en pause, dont tous les critères obligatoires sont satisfaits par les réponses et la qualification.
2. Retirer ceux qui ont atteint `daily_cap` ou `weekly_cap` (comptés sur les `appointments` en `pose` ou `honore` de la période), et ceux dont le pack prépayé a `remaining = 0`.
3. Trier par `priority` croissant, puis par équité : celui qui a reçu un RDV le moins récemment.
4. Proposer le premier au setter (il peut choisir le second avec un motif). Assignation exclusive : `leads.buyer_id` et `routed_at`.
5. Aucun candidat : le lead reste `QUALIFIÉ`, entre dans la file « à router manuellement », alerte admin.

**Règle RGPD.** Un lead déjà routé vers un acheteur ne peut être routé vers un autre que si `reroute_consent_at` est renseigné (nouveau consentement obtenu et horodaté par le setter, au téléphone ou par SMS de confirmation). Sans cela, le bouton est désactivé.

**v0.** Une source, un acheteur actif : l'algorithme renvoie toujours le même, mais la structure existe pour ne pas tout réécrire au deuxième acheteur.

### 4.6 Module F — Portail acheteur **[v0 minimal, v1 complet]**

**Accès.** Lien magique par email (pas de mot de passe en v0), sessions courtes, un acheteur ne voit que ses `appointments`.

**Écran principal.** Liste des rendez-vous à valider (tri par `validation_due_at`), puis à venir, puis passés. Pour chaque RDV : date, prénom, tranche de montant, objectif, timing, notes du setter, et le formulaire de validation en trois questions : *Le rendez-vous a-t-il eu lieu ?* (oui / non), *Le profil correspond-il à vos critères ?* (oui / non + motif fermé), *Suite* (en cours / signé / perdu, modifiable plus tard).

**Délais.** `validation_due_at = scheduled_at + validation_delay_hours`. Rappel email à 24 h et à 44 h. À l'échéance : si `tacit_validation_enabled`, validation tacite (`validated_by = tacit`) ; sinon, alerte admin et le RDV reste en attente (comportement du premier pack).

**Retours.** Un « non conforme » crée une demande de retour visible par l'admin, avec le motif. L'admin accepte (remplacement dû, non facturé) ou refuse (facturé) avec un commentaire ; l'acheteur voit la décision.

**v0.** Le portail peut être remplacé par un formulaire pré-rempli envoyé par email (un lien par RDV, les trois questions), à condition que la réponse écrive dans `appointments`. Ce qui compte en v0, c'est la donnée, pas l'écran.

### 4.7 Module G — Retour vers les plateformes (Meta CAPI) **[v0 partiel, v1 complet]**

**Événements envoyés** (API Conversions Meta, côté serveur) :

| Moment | `event_name` | Données |
|---|---|---|
| Lead créé | `Lead` | `em`, `ph` hachés SHA-256, `fbc`, `fbp`, `client_ip`, `client_user_agent`, `event_source_url`, `event_id = lead_id` |
| RDV posé | `Schedule` | idem + `custom_data.buyer` (id interne, pas le nom) |
| RDV honoré | `RDV_Honore` (custom) | idem |
| RDV conforme | `RDV_Conforme` (custom) | idem + `custom_data.value = price_per_rdv`, `currency` |
| Signé | `Signe` (custom) | idem + `custom_data.value` (valeur estimée, paramétrable par acheteur) |

- Chaque envoi est journalisé dans `conversion_events` avec la réponse ; échec = nouvelle tentative (3 fois, backoff), puis alerte.
- `event_time` = horodatage réel de l'événement (pas l'envoi), dans la fenêtre acceptée par Meta (7 jours) ; au-delà, l'événement est envoyé en « conversions hors ligne » lors d'un import hebdomadaire.
- **v0** : `Lead` et `Schedule` en temps réel par CAPI ; `RDV_Honore`, `RDV_Conforme`, `Signe` via un export CSV hebdomadaire importé à la main dans le Gestionnaire (conversions hors ligne). **v1** : tout en temps réel.
- Google Ads (conversions hors ligne avec GCLID) : hors périmètre tant qu'il n'y a pas de Google.

### 4.8 Module H — Facturation, packs, reporting **[v0 reporting, v1 facturation]**

**Packs.** À chaque `appointments.billable` qui passe à `true` : `packs.remaining -= 1` sur le pack actif de l'acheteur (le plus ancien non épuisé). À `remaining = low_threshold` : email à l'acheteur (« il vous reste 2 rendez-vous ») et alerte admin. À `0` : pack `epuise`, l'acheteur sort des candidats du routage jusqu'au pack suivant. Un pack `is_pilot` fonctionne pareil, à 0 €.

**Mensuel.** Le 1er du mois : relevé par acheteur des RDV `billable` du mois précédent, facture en brouillon, export PDF/CSV. Les retours acceptés apparaissent en ligne à 0 € avec la mention « remplacement ».

**Tableau du lundi.** Recalculé chaque nuit et à la demande, par source, semaine et campagne, avec les colonnes exactes du fichier `tableau-du-lundi.xlsx` : dépense (saisie par l'admin ou importée depuis l'API Marketing Meta en v1), leads, coût par lead, RDV posés, taux de prise, honorés, taux de présence, conformes, conformité, coût par RDV conforme, signés, délai moyen de rappel, alertes. Seuils dans une table `settings` (mêmes valeurs par défaut que l'onglet Paramètres : 0,5 · 10 min · 70 % · 22 % · 30 €).

**Alertes calculées** (texte, dans l'ordre) : `BUDGET GELÉ` si coût par RDV conforme / prix de vente > 0,5 ; `RAPPEL` si délai moyen > 10 min ; `QUALITÉ` si conformité < 70 % ; `PRISE RDV` si taux de prise < 22 % ; `CPL` si coût par lead > 30 €.

**Exports.** CSV du tableau, CSV des leads « à nourrir » vers Brevo, CSV des conversions hors ligne pour Meta, CSV des acheteurs. Chaque export est journalisé dans `audit_log`.

---

## 5. Rôles et permissions

| Rôle | Voit | Fait |
|---|---|---|
| **Admin** (Killian) | Tout, toutes sources | Paramètres, acheteurs, packs, retours, exports, saisie des dépenses |
| **Setter** | Les leads de ses sources, sans les données d'autres setters | Rappel, qualification, prise de RDV, notes |
| **Acheteur** (`buyer_users`) | Ses propres RDV uniquement, jamais les autres acheteurs ni les leads non routés | Validation, suite, demande de retour, export de ses RDV |

Toute action passe par le serveur (pas de logique métier dans le client). Les rôles sont vérifiés à chaque requête, pas seulement à l'affichage. Ils sont stockés dans `core.memberships` (section 0.1) avec un périmètre : `platform_admin` sans périmètre, `setter` et `client_viewer` sur une ou plusieurs sources, `buyer` sur un seul `buyer_id`. L'isolation des acheteurs est doublée par les politiques de row-level security de la base.

---

## 6. Intégrations

| Intégration | Rôle | Version |
|---|---|---|
| Site MEP (diagnostic) | Webhook `POST /api/v1/leads` + `PATCH answers` ; champs cachés UTM/fbclid ; cookies `_fbc`/`_fbp` | v0 |
| SMS | Alertes setter, SMS lead (hors service, rappels J-1/H-2, lien de créneau). Brevo SMS (déjà utilisé) ou Twilio | v0 |
| Email | Confirmations, liens magiques, rappels de validation, relevés. Brevo transactionnel | v0 |
| Calendrier | Calendly (webhook) en v0 ; Cal.com ou Google Calendar API en v1 | v0/v1 |
| Meta CAPI | Événements `Lead`, `Schedule` en v0 ; les trois autres en v1 | v0/v1 |
| Meta Marketing API | Import automatique des dépenses par campagne pour le tableau | v1 |
| Brevo (contacts) | Export des leads « à nourrir » dans une liste dédiée | v0 (export CSV) / v1 (API) |
| Slack | Alertes admin (SLA, file à router, retours) | v0 optionnel |

---

## 7. Exigences non fonctionnelles

**RGPD.** Preuve de consentement conservée avec le lead (texte, version, horodatage, IP hachée). Droit d'accès et de suppression : une action admin « exporter » et « supprimer » par lead, qui anonymise le lead et ses événements (soft delete puis purge à 30 jours), et journalise l'opération. Durée de conservation par défaut : 24 mois pour un lead non converti, puis anonymisation automatique. Un acheteur ne reçoit que les données nécessaires au rendez-vous. Le texte de consentement affiché sur le site et celui stocké doivent être identiques (le site envoie le texte, The Pilot le stocke tel quel).

**Sécurité.** Authentification serveur, sessions courtes pour le portail, secrets par source, limitation de débit sur le webhook, chiffrement des champs personnels au repos, HTTPS partout, aucune donnée personnelle dans les URL ni dans les logs applicatifs.

**Traçabilité.** `lead_events` et `audit_log` append-only. Chaque valeur calculée du tableau du lundi est reproductible à partir des événements.

**Temps.** Toutes les dates stockées en UTC, affichées en `Europe/Paris`. Les règles horaires (heures de service, rappels J-1 18 h) s'évaluent en heure de Paris. Aucun calcul de délai ne dépend de l'heure du navigateur.

**Robustesse.** Le webhook répond en moins de 500 ms et délègue le reste (alertes, CAPI) à une file de tâches. Tout job (alerte, rappel, tacite, CAPI, recalcul) est idempotent et rejouable.

**Observabilité.** Trois métriques en temps réel sur un écran admin : leads reçus aujourd'hui, délai médian de rappel du jour, RDV en attente de validation dont l'échéance est dans moins de 4 h.

---

## 8. Critères d'acceptation

The Pilot Lead v0 est prêt pour le pilote quand tout ceci est vrai :

1. Un lead test envoyé depuis le site MEP avec des UTM et un `fbclid` apparaît dans The Pilot avec sa campagne résolue, son texte de consentement et son horodatage serveur ; le même envoi rejoué avec la même `idempotency_key` ne crée pas de doublon.
2. Le SMS d'alerte arrive au setter en moins de 30 secondes pendant les heures de service ; hors service, le lead reçoit le SMS d'attente et l'alerte part à l'ouverture.
3. Le clic « J'appelle » fixe `first_call_at` une seule fois ; le délai affiché correspond à `first_call_at − received_at` en excluant les heures hors service.
4. La fiche d'appel ne contient aucun champ permettant de saisir un produit ou un partenaire.
5. Un lead qualifié est routé vers l'unique acheteur actif, un RDV est créé avec une date, le lead reçoit une confirmation, l'acheteur reçoit la fiche.
6. L'acheteur peut répondre aux trois questions de validation depuis un lien reçu par email ; la réponse écrit dans `appointments` ; un RDV « honoré + conforme » devient `billable` et décrémente le pack pilote.
7. Sans réponse de l'acheteur à 48 h, avec la validation tacite désactivée, le RDV reste en attente et l'admin est alerté ; avec la validation tacite activée, il devient conforme avec `validated_by = tacit`.
8. Le tableau du lundi produit, pour la semaine du lead test, la ligne de sa campagne avec 1 lead, 1 RDV posé, et les alertes attendues selon la dépense saisie.
9. Les événements `Lead` et `Schedule` sont visibles dans le Gestionnaire d'événements Meta avec l'`event_id` du lead ; l'export CSV hebdomadaire des conversions hors ligne contient le RDV conforme.
10. La suppression RGPD d'un lead anonymise son nom, son téléphone, son email et ses réponses, conserve les compteurs agrégés, et laisse une trace dans `audit_log`.
11. The Pilot Lead a sa propre page de connexion et ses propres comptes ; aucune table, aucun secret et aucune session ne sont partagés avec The Pilot, et le rôle Postgres `app_lead` n'a aucun droit sur la base de The Pilot (vérifiable par `\dp` / tentative de lecture refusée).
12. Connecté comme acheteur A, l'appel direct de l'URL d'un rendez-vous de l'acheteur B renvoie `404` ; la requête SQL correspondante, exécutée avec `app.buyer_id = A`, ne renvoie aucune ligne (politique RLS active sur `appointments`, `packs`, `invoices`).
13. L'admin ouvre le compte d'un acheteur en « Voir en tant que » : le bandeau s'affiche, une ligne existe dans `core.impersonations`, et une écriture faite dans ce mode apparaît dans `lead_events` avec `actor_type = admin` et `on_behalf_of` renseigné.

---

## 9. Roadmap de développement

**v0 — le pilote (objectif : 2 semaines de dev)**
Modules A, B, C complets. D en mode lien Calendly + saisie manuelle. E réduit à un acheteur par source. F en mode « formulaire par email » ou portail minimal. G : `Lead` et `Schedule` par CAPI, le reste par CSV. H : tableau du lundi + pack pilote. Rôles admin et acheteur. RGPD : consentement, export, suppression.

Ordre conseillé : A → tableau H (pour que la mesure existe dès le premier lead) → B → C → D → F → G → E.

**v1 — les packs payants (mois 3 à 4)**
Routage multi-acheteurs avec plafonds et équité. Portail acheteur complet avec retours. Calendrier par API. CAPI complet en temps réel. Facturation mensuelle et packs prépayés. Import automatique des dépenses Meta. Rôle setter avec rémunération à la conformité (rapport dédié). Nurture via API Brevo.

**v2 — l'échelle (mois 6+)**
Multi-tenant (The Pilot vendu à d'autres cabinets ou agences). Agent vocal pour le premier tri. Enregistrement des appels avec consentement. Google Ads conversions hors ligne. Tableau de bord acheteur avec son propre taux de signature. API publique pour les acheteurs qui veulent intégrer leur CRM.

---

## 10. Décisions techniques à prendre (par Killian)

- **Stack.** Le document est compatible avec n'importe quelle stack web moderne. Recommandation si tu repars de zéro : Postgres (jsonb pour `answers` et `criteria`, contraintes d'unicité, vues matérialisées), un backend avec file de tâches (les jobs de la section 7), un front simple pour les trois écrans qui comptent (liste à rappeler, fiche d'appel, portail acheteur).
- **SMS.** Brevo SMS si tu veux un seul fournisseur, Twilio si tu veux la meilleure délivrabilité sur les alertes.
- **Calendrier.** Calendly en v0 parce que les acheteurs l'ont souvent déjà ; Cal.com en v1 pour l'API et le self-hosting.
- **Hébergement.** Dans l'Union européenne (RGPD), sauvegardes quotidiennes, secrets hors du code.
- **Ce que The Pilot actuel devient.** Rien : il continue sa vie telle quelle, au service de Seven At Home. The Pilot Lead naît vide, avec la seule source `mep`, sur sa propre base et sa propre URL (section 0.1).

---

*Document de spécification établi pour Breach à partir de « L'Usine à Rendez-vous » et du premortem du 2 septembre 2026. Les délais de développement sont des estimations pour un développeur seul ; la règle du plan reste valable : pas de module v1 avant le premier acheteur payant.*
