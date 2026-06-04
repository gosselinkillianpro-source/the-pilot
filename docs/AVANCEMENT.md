# THE PILOT — État d'avancement

> Journal de bord pour reprendre le dev d'une session à l'autre.
> **Pour Claude Code** : lire ce fichier en début de session pour savoir où on en est.
> Dernière mise à jour : 2026-06-02 (EN LIGNE sur Render + intégration SAH live + données réelles).

> ## 🟢 ÉTAT AU 2026-06-02 — en ligne + vraies données SAH
> - **Hébergé sur Render** (région Frankfurt EU). Dépôt GitHub privé `gosselinkillianpro-source/the-pilot`, push `main` → autodeploy. Config : `render.yaml`, guide : `docs/DEPLOIEMENT-RENDER.md`. Build pnpm : voir `pnpm-workspace.yaml` (`allowBuilds: true` — sinon ERR_PNPM_IGNORED_BUILDS).
> - **IP dédiées Render** : `74.220.51.220/221/222` (whitelistées par SAH).
> - **Intégration SAH (Option C, réplique PostgreSQL lecture seule)** : `SAH_DATABASE_URL` (env Render), client `src/lib/integrations/sah/`. Plateforme Capsens/Rails. Sync `runSahSync()` (investisseurs + projets), déclenchable sur `/settings/sah` (admin). **2783 investisseurs + 81 projets synchronisés**. Mapping : `registration_complete` = users_profiles.status='validate' ; `onboarding_complete` = wallet_status='6' OU lw_onboarding_status='accepted'. On ne lit JAMAIS : bank_accounts, kyc_documents, encrypted_password.
> - **Pipeline + fiche investisseur = vraies données** (`/closing/pipeline` liste cherchable/paginée, `/closing/investor/[id]`). L'email IA tourne sur les vrais projets.
> - **Restant** : sync souscriptions + dates de remboursement (`lending_investor_terms.due_on`) → débloque total investi, attribution, scoring. Puis scoring IA + sync auto (cron). Cloudflare Access. Rotation des clés exposées en chat.

> ## 🟢 FICHE INVESTISSEUR ENRICHIE + AUTO-REFRESH (2026-06-04)
> - **Migration 0004** : nouvelles colonnes `investors` (civility, nationality, country_residence, address_street/complement, tax_residency_country, bonus_code, cgp_name, cgp_network, wallet_balance_cents, wallet_status, lw_onboarding_status/id, lemonway_account_id, kyc_validated_at, sah_created_at/updated_at) + `subscriptions` (shares_count, canceled_at). **Jamais** d'IBAN/BIC/password (interdits). Appliquée à Supabase.
> - **Sync enrichie** (`src/lib/integrations/sah/sync.ts`) : users + users_profiles + `bonus_codes` (code + ambassador_name) + `distributor_legal_entities` (name). Nouvelle `syncSubscriptions()` (14795 souscriptions, lien `subscriptions.users_profile_id → users_profiles.user_id`, projet via `project_id`). Statut dérivé des dates (canceled/paid/signed).
> - **Fiche `/closing/investor/[id]`** refondue : blocs Identité, Coordonnées, Apporteur (CGP), Lemonway/Onboarding, Dates + **liste des souscriptions** (total investi).
> - **Auto-refresh en 3 vitesses** (route `/api/cron/sah-sync?scope=…`, publique, fail-closed sur `CRON_SECRET`, garde anti-chevauchement) :
>   - `scope=light` (projets + investisseurs/statuts) — cron Render `*/15 * * * *`.
>   - `scope=subscriptions` (NOUVELLES souscriptions seulement, `onConflictDoNothing` car figées) — cron Render `0 * * * *` (toutes les heures).
>   - `scope=full` (tout, upsert complet) — bouton manuel `/settings/sah`.
> - ⚠️ **À FAIRE CÔTÉ RENDER** : (1) « Apply blueprint » → crée 2 services cron (`the-pilot-sync-sah`, `the-pilot-sync-subscriptions`) ; (2) régler `CRON_SECRET` (web), `SYNC_URL=…?token=<CRON_SECRET>&scope=light` (cron 1), `SYNC_URL_SUBS=…?token=<CRON_SECRET>&scope=subscriptions` (cron 2) ; (3) **synchro manuelle** une fois (bouton) pour peupler.
> - ⚠️ **À VÉRIFIER** : (a) montant des souscriptions = euros ou cents ? (vérifier sur une fiche connue) ; (b) CGP/réseau = best-effort (`distributor_legal_entities` via `users.distributor_id`) — confirmer avec SAH si faux.

> ## 🔴 VÉRIFICATION DONNÉES (2026-06-04) — mapping « profil complet » À CORRIGER
> Contrôle du CSV `users-profiles` exporté par SAH (2855 profils, 2783 personnes) contre notre base.
> - **Grain** : le CSV est par PROFIL (2855), notre base par PERSONNE (2783, agrégée `bool_or`). 62 personnes ont >1 profil. **Total OK** (2783 = 2783).
> - **`onboarding_complete` = JUSTE** : 1795 (fichier) ≈ 1797 (SAH live). Règle `wallet_status='6' OR lw_onboarding_status='accepted'` validée.
> - **`registration_complete` = FAUX** : on utilise `status='validate'` → 1779 personnes, mais le fichier dit **2111** « profil complet ». Conséquence : le badge « Profil complété » n'apparaît jamais (0 personne dans cette catégorie) + 16 « onboardés sans profil complet » (logiquement impossible).
> - **Cause** : `status='validate'` ≠ « Profil complet ». L'exploration (`/settings/sah`, échelle des `status`) montre que la cible 2111 ne correspond à AUCUNE combinaison de status (validate=1779, +invite=2346). Croisement CSV : « profil complet » ⟹ **nom+prénom remplis (2168/2168, 0 exception)** MAIS pas suffisant (274 ont un nom sans être « complet »). Donc règle = **nom rempli ET un 2ᵉ critère** non identifié dans la réplique.
> - **EN ATTENTE** : règle exacte de « Profil complet ? » côté SAH (question posée). À réception → corriger `syncInvestors()` dans `src/lib/integrations/sah/sync.ts`, re-synchroniser, vérifier qu'on retombe sur **672 inscrits / 316 profil complété / 1795 onboardés**.
> - Outils en place : explorateur enrichi (`/settings/sah` : scan colonnes + échelle status) ; script `scripts/verify-investors-count.mjs` (compte les 3 catégories en base) ; libellés des 3 niveaux centralisés dans `src/lib/investor-stage.ts` (Inscrit / Profil complété / Onboardé).

> ## ⚠️ AVANT LA MISE EN LIGNE — réactiver l'authentification
> L'auth est **désactivée en dev local** (`DISABLE_AUTH=true` dans `.env.local`). Un bandeau rouge le rappelle dans l'app.
> **Avant tout déploiement** : retirer `DISABLE_AUTH` de `.env.local`. (En prod elle se rallume seule via le check `NODE_ENV`, mais à vérifier.) Le système login + 2FA est intact, rien n'a été supprimé.

---

## Où on en est : V0 + fondations connectées

L'app tourne en local (`pnpm dev` → http://localhost:3000). Toutes les vérifs passent (`pnpm lint && pnpm typecheck && pnpm build`).

### Connexions actives (réelles)
- **Supabase** (base de données + auth) : projet en région **Paris (EU)**, réf `ixqtyrcvxhoxjtejdacs`. Connecté via **Session pooler**. Clés dans `.env.local` (gitignored).
- **Brevo** (emailing) : compte Sevenathome, clé API v3 dans `.env.local`. 2815 contacts, 21 listes, 56 campagnes.

### Base de données
- 9 tables créées (migration Drizzle `0000`) : `users, investors, projects, subscriptions, interactions, email_flows, email_flow_runs, audit_log, llm_calls`.
- **RLS activée** sur toutes les tables (`drizzle/policies.sql`, appliquée via `scripts/apply-rls.mjs`). Rôle lu depuis le JWT (`app_metadata.role`). admin = tout ; closer = ses leads ; executive = lecture.
- Schéma : `src/lib/db/schema.ts`. Pas de KYC sensible (juste `registration_complete` + `onboarding_complete`).

### Interface (vues, avec données FAKE pour l'instant)
- `/` : landing "Pilote ton marketing"
- `/dashboard` : KPIs + chart + alertes
- `/closing/pipeline` : Kanban des leads (mock)
- `/closing/investor/[id]` : fiche investisseur + AI brief + timeline (mock)
- `/email` : **données Brevo RÉELLES** (contacts, listes, campagnes, transactionnel)
- `/email/compose` : **composer + envoyer un email** (RÉEL via Brevo)
- `/ads`, `/social`, `/performance`, `/performance/actions` : mock
- Données fake : `src/lib/mock-data.ts` (à remplacer par les vraies données SAH quand l'API SAH sera dispo)

### Connexion / sécurité (NOUVEAU — fonctionnel)
- **Login email + mot de passe** : `/login` (Supabase Auth). Pas d'inscription publique (outil interne).
- **2FA obligatoire** (admin, closer, closer_junior) via code à 6 chiffres (TOTP, type Google Authenticator) :
  - 1ère connexion → `/mfa/setup` (scan d'un QR code) ; connexions suivantes → `/mfa` (saisie du code).
  - `executive` : 2FA non imposé.
- **Verrouillage des routes** : middleware `src/lib/auth/session.ts`. Pas connecté → `/login` ; 2FA non validé → `/mfa` ou `/mfa/setup`.
- **Déconnexion** : bouton dans la sidebar (`src/components/shared/user-menu.tsx`). La sidebar affiche le vrai nom/rôle (déduits de l'email).
- **Créer un compte** : `node --env-file=.env.local scripts/create-user.mjs <email> <mdp> [role]` (role défaut : admin).
- Actions auth : `src/app/(auth)/actions.ts`. Audit log sur connexion/déconnexion/enrôlement 2FA.
- ⚠️ **Désormais l'app est verrouillée** : il FAUT un compte (script ci-dessus) pour entrer, même en local.

### Centre Email — Brevo dans l'app (NOUVEAU, 4 phases)
Objectif : ne plus aller sur Brevo. Tout depuis `/email`.
- **Boîte d'envoi** (`/email/sent`) : liste des emails envoyés + statut (livré/ouvert/cliqué/bounce), reconstruite depuis `/smtp/statistics/events` (l'endpoint `/smtp/emails` renvoie 400).
- **Contacts & listes** (`/email/contacts`) : liste paginée + recherche par email + créer contact / créer liste (actions sécurisées auth+rôle+audit).
- **Campagnes** (`/email/campaign/new`) : créer une campagne (template marque + scan AMF) → **brouillon Brevo**. Envoi réel **gaté par `EMAIL_TEST_MODE`** (refusé tant qu'on est en test).
- **Webhook** (`/api/webhooks/brevo`) : reçoit les events Brevo → table **`email_events`** (migration 0003, RLS posée). Protégé par **`BREVO_WEBHOOK_SECRET`** (fail-closed). Endpoint public (ajouté aux `PUBLIC_PREFIXES` du middleware). Alimentera le scoring email + l'activité contact.
  - ⚠️ **À configurer pour recevoir les vrais events** : dans Brevo → Paramètres → Webhooks, URL = `https://<ton-domaine>/api/webhooks/brevo?token=<BREVO_WEBHOOK_SECRET>`. En local (localhost), Brevo ne peut pas joindre l'app → nécessite un déploiement ou un tunnel (ngrok). Le secret est déjà dans `.env.local`.
- Pas reconstruits volontairement : l'éditeur visuel drag&drop et le constructeur d'automatisations (trop lourd, peu rentable).

### Email IA sur la fiche investisseur (NOUVEAU)
- Sur `/closing/investor/[id]` : bouton **« Générer une proposition »** → l'IA (Claude) rédige un email calé sur le score + la situation + les projets ouverts. Brouillon **éditable**, puis envoi via `sendEmailAction` (mode test → adresse de test).
- Garde-fous : prompt cadré AMF (`src/lib/ai/investor-emails.ts`), scan AMF, `requireRole(closer/admin)`, journalisation LLM (`src/lib/ai/log-llm.ts` → table `llm_calls`), audit.
- ⚠️ **Nécessite `ANTHROPIC_API_KEY` dans `.env.local`** (sinon message clair, pas de crash). À ajouter puis relancer le serveur.
- Type « Proposition » fait. À venir : emails **compte-rendu d'appel** + **action post-appel** (même mécanique + champ « notes d'appel »).

### Envoi d'email (fonctionnel)
- 3 modes : personnes / liste Brevo existante / nouveau groupe.
- **Scan AMF** bloquant (`src/lib/ai/amf-compliance.ts`).
- **MODE TEST** par défaut (`EMAIL_TEST_MODE=true` dans `.env.local`) : tout envoi part uniquement vers `EMAIL_TEST_ADDRESS`. Aucun risque d'emailer un vrai investisseur.
- Template de marque : `src/lib/email/template.ts` (logo SAH, footer légal + disclaimer AMF). Logo via `NEXT_PUBLIC_EMAIL_LOGO_URL`.
- Audit log à chaque envoi.

---

## Ce qui n'est PAS encore fait

1. **Cloudflare Access** : la couche réseau (qui peut atteindre l'app) reste à brancher en prod. Le login Supabase + 2FA est fait (cf. plus haut). Reste aussi un `TODO requireRole` à câbler dans `email/compose/actions.ts` maintenant que l'auth existe.
2. **Intégration données SAH** : BLOQUÉ tant que l'appel technique SAH n'a pas eu lieu (cf. `docs/appel-sah-questions.md`). C'est ce qui permettra de remplacer les données fake par les vraies.
3. **Scoring IA + Attribution réelle** : spec complète dans **`docs/the-pilot-priorisation-performance.md`** (2 moteurs : scoring urgence×valeur + règle 48h ; attribution last-touch / « l'appel prime » / fenêtre 30j). Les vues existent en mock (`/closing/pipeline`, `/performance`). **Bloqué tant qu'on n'a pas les vraies données SAH** (souscriptions, dates projets, statuts KYC) + le tracking des actions (appels) + l'engagement email Brevo (clics/ouvertures). Signal n°1 à câbler : date de remboursement = date souscription + durée projet.
4. **Envoi réel aux listes** : en mode test seulement pour l'instant. Le passage en réel (campagne Brevo) sera activé quand `EMAIL_TEST_MODE=false`.
5. **Logo email en PNG** : actuellement OFFIC-3.png (fond plein, OK). Un logo transparent (.webp) causait un fond noir → à garder en fond plein.
6. **Dark mode** : variables prêtes, toggle non branché.

---

## Prochaines étapes possibles (au choix)

- **Login Supabase** (rend l'app réelle + active la sécurité RLS pour de vrai).
- **Synchroniser les contacts Brevo** → fiches investisseurs dans la base.
- **Préparer / passer l'appel SAH** (doc prêt) pour débloquer les vraies données.
- **Envoi réel d'emails** (désactiver le mode test une fois sûr).

---

## Commandes utiles

```
pnpm dev            # lance l'app sur http://localhost:3000
pnpm lint           # vérifie le code (Biome)
pnpm typecheck      # vérifie les types
pnpm build          # build de production
pnpm db:generate    # génère une migration depuis le schéma
pnpm db:migrate     # applique les migrations à Supabase
node scripts/db-test.mjs        # teste la connexion DB + liste les tables (charger .env.local avant)
node scripts/apply-rls.mjs      # ré-applique les règles de sécurité RLS
```

Pour relancer le serveur : ouvrir un terminal dans `C:\Users\Unite\Desktop\THE PILOT` et taper `pnpm dev`.

---

## Comment reprendre dans une nouvelle conversation

1. Ouvrir une nouvelle conversation Claude Code dans le dossier `THE PILOT`.
2. Claude relit automatiquement `CLAUDE.md` + sa mémoire (profil Killian, sécurité, etc.).
3. Dire : **« Lis docs/AVANCEMENT.md et docs/appel-sah-questions.md, on continue »**.
4. Claude est de nouveau à jour et on enchaîne.
