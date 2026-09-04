# THE PILOT LEAD

L'usine à rendez-vous de Breach : reçoit les leads des marques de Breach (MonExpertPatrimoine
aujourd'hui), les fait rappeler en moins de cinq minutes, les qualifie, les route vers un
acheteur ORIAS, pose le rendez-vous, prouve la livraison, facture, et renvoie le résultat aux
plateformes publicitaires.

Spécification de référence : `THE-PILOT-LEAD-SPEC.md` (v1, 3 septembre 2026).

## Deux logiciels, un dépôt

The Pilot Lead vit dans `apps/lead`. C'est une application **indépendante** de THE PILOT
(Seven At Home, à la racine du dépôt) : propre process, propre URL, propre page de connexion,
propres secrets, **propre projet Supabase**. Aucune donnée de Seven At Home n'entre ici, aucun
code n'est partagé.

## Démarrer en local

```bash
cp apps/lead/.env.example apps/lead/.env.local   # puis renseigner les clés
pnpm install                                     # à la racine du monorepo
pnpm --filter the-pilot-lead db:migrate          # avec DATABASE_ADMIN_URL
node --env-file=apps/lead/.env.local apps/lead/scripts/apply-roles.mjs     # rôle app_lead
node --env-file=apps/lead/.env.local apps/lead/scripts/apply-policies.mjs  # RLS
node --env-file=apps/lead/.env.local apps/lead/scripts/create-user.mjs <email> <mdp> admin
node --env-file=apps/lead/.env.local apps/lead/scripts/seed-source.mjs mep
pnpm --filter the-pilot-lead dev                 # http://localhost:3001
```

## Definition of Done

```bash
pnpm --filter the-pilot-lead lint
pnpm --filter the-pilot-lead typecheck
pnpm --filter the-pilot-lead test:run
pnpm --filter the-pilot-lead build
```

## Où est quoi

| Dossier | Rôle |
|---|---|
| `src/app/(app)` | écrans internes (admin, setter) |
| `src/app/(buyer)` | portail acheteur |
| `src/app/(auth)` | connexion (mot de passe, lien magique) |
| `src/app/api/v1` | réception des leads (webhook des sites) |
| `src/app/api/cron` | tick des jobs (chaque minute) |
| `src/lib/domain` | règles métier pures, testées : machine à états, SLA, routage, dédoublonnage |
| `src/lib/db` | schéma Drizzle (schéma Postgres `lead`), client, session RLS |
| `src/lib/jobs` | file de tâches en base + handlers idempotents |
| `src/lib/integrations` | Telegram, Brevo (email + SMS), Meta CAPI, Calendly |
| `drizzle/` | migrations, `roles.sql`, `policies.sql` |
