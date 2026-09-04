# The Pilot Lead — mise en service (runbook)

> Qui fait quoi : **Killian** crée les comptes et colle les secrets ; **le code** fait le reste.
> Tout se passe dans un projet Supabase et un service Render **distincts** de THE PILOT.

## 1. Projet Supabase dédié (EU, Frankfurt)

1. Supabase → New project, région **Frankfurt**, nom `the-pilot-lead`.
2. Authentication → Providers → Email : laisser activé. **Désactiver « Allow new users to sign up »** (aucune inscription libre : les comptes sont créés par script ou invitation).
3. Authentication → URL Configuration : Site URL = l'URL de l'app (Render), Redirect URLs = `https://<app>/auth/callback`.
4. Récupérer : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, et la chaîne de connexion Postgres (rôle `postgres`) → `DATABASE_ADMIN_URL`.
5. Copier `apps/lead/.env.example` → `apps/lead/.env.local` et remplir. Générer :
   ```bash
   openssl rand -base64 48   # SECRET_ENCRYPTION_KEY
   openssl rand -hex 16      # LEAD_HASH_SALT
   openssl rand -hex 24      # CRON_SECRET
   openssl rand -base64 32   # APP_LEAD_PASSWORD (mot de passe du rôle app_lead)
   ```

## 2. Base : schéma, rôle, RLS, source, admin

Depuis la racine du dépôt :

```bash
pnpm install
DATABASE_ADMIN_URL='…' pnpm --filter the-pilot-lead db:migrate
APP_LEAD_PASSWORD='…' node --env-file=apps/lead/.env.local apps/lead/scripts/apply-roles.mjs
node --env-file=apps/lead/.env.local apps/lead/scripts/apply-policies.mjs
node --env-file=apps/lead/.env.local apps/lead/scripts/seed-source.mjs mep "MonExpertPatrimoine"
node --env-file=apps/lead/.env.local apps/lead/scripts/create-user.mjs killian@breach.app '<mot de passe>' admin "Killian"
```

- `apply-roles.mjs` imprime la `DATABASE_URL` à utiliser pour l'app (rôle `app_lead`, sans bypass RLS).
- `apply-policies.mjs` vérifie que **chaque** table a la RLS activée, forcée, et au moins une politique. S'il s'arrête, ne pas déployer.
- `seed-source.mjs` affiche le secret `X-Source-Key` **une seule fois** → fichier `~/mep-leads/config.php` chez o2switch (voir le dépôt du site, `docs/the-pilot-lead.md`).

Vérification de l'isolation (critères 11 et 12 de la spec) : avec `psql` en tant que `app_lead`,
`select set_config('app.role','buyer',true), set_config('app.buyer_id','<id acheteur A>',true); select count(*) from lead.appointments where buyer_id = '<id acheteur B>';` doit renvoyer **0**.

## 3. Render

1. Render → Blueprints → le dépôt `the-pilot` → **Apply / Sync** : le `render.yaml` déclare le service web `the-pilot-lead` et le cron `the-pilot-lead-tick`.
2. Coller les variables du service web (liste dans `render.yaml`, valeurs dans `.env.local`). `NEXT_PUBLIC_APP_URL` = l'URL Render une fois connue, puis redéployer.
3. Cron : `LEAD_TICK_URL = https://<app>/api/cron/tick?token=<CRON_SECRET>`.
4. Après le premier déploiement : ouvrir `/login`, se connecter avec le compte admin.

## 4. Canaux

- **Telegram** : créer un bot via @BotFather → `TELEGRAM_BOT_TOKEN`. Chaque setter démarre le bot, récupère son identifiant auprès de @userinfobot, le colle dans *Mes alertes* et se met **de garde**.
- **Brevo** (compte Breach / MEP) : clé API, expéditeur email validé (`rdv@monexpertpatrimoine.fr`), nom d'expéditeur SMS (11 caractères) validé, crédits SMS. Laisser `EMAIL_TEST_MODE=true` / `SMS_TEST_MODE=true` avec une adresse et un numéro de test jusqu'au premier lead réel validé.
- **Meta CAPI** : Gestionnaire d'événements → dataset de MEP → jeton d'accès → `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`. `META_CAPI_TEST_EVENT_CODE` pour vérifier sans polluer.

## 5. Premier acheteur

Acheteurs → Nouvel acheteur : nom, ORIAS, email de contact, critères (cocher les **obligatoires**), prix par RDV, lien de réservation, puis *Créer un pack* (pilote offert : cocher « pack pilote ») et *Inviter un email* pour l'accès au portail (lien magique sur `/login/acheteur`).

## 6. Test de bout en bout

1. Diagnostic complet sur le site avec `?utm_source=meta&utm_campaign=TEST&utm_content=adset&utm_term=crea&fbclid=TEST` et un vrai numéro.
2. Le lead apparaît dans *À rappeler* avec sa campagne, son consentement et son chrono ; Telegram reçoit l'alerte en moins de 30 s.
3. *J'appelle* → `first_call_at` fixé une fois ; *RDV posé* → confirmation SMS/email au lead (en mode test : vers les adresses de test), fiche à l'acheteur.
4. Le même envoi rejoué (même `sessionId`) ne crée pas de doublon.
