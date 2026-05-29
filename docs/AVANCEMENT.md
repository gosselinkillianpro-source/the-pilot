# THE PILOT — État d'avancement

> Journal de bord pour reprendre le dev d'une session à l'autre.
> **Pour Claude Code** : lire ce fichier en début de session pour savoir où on en est.
> Dernière mise à jour : 2026-05-29.

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

### Envoi d'email (fonctionnel)
- 3 modes : personnes / liste Brevo existante / nouveau groupe.
- **Scan AMF** bloquant (`src/lib/ai/amf-compliance.ts`).
- **MODE TEST** par défaut (`EMAIL_TEST_MODE=true` dans `.env.local`) : tout envoi part uniquement vers `EMAIL_TEST_ADDRESS`. Aucun risque d'emailer un vrai investisseur.
- Template de marque : `src/lib/email/template.ts` (logo SAH, footer légal + disclaimer AMF). Logo via `NEXT_PUBLIC_EMAIL_LOGO_URL`.
- Audit log à chaque envoi.

---

## Ce qui n'est PAS encore fait

1. **Login / auth réelle** : pas d'écran de connexion. L'app n'est pas encore protégée par "qui es-tu" (OK en local). À faire : Supabase Auth + 2FA + Cloudflare Access. (Un `TODO requireRole` est posé dans `email/compose/actions.ts`.)
2. **Intégration données SAH** : BLOQUÉ tant que l'appel technique SAH n'a pas eu lieu (cf. `docs/appel-sah-questions.md`). C'est ce qui permettra de remplacer les données fake par les vraies.
3. **Attribution réelle** (ROI par action) : la vue existe en mock ; le calcul réel viendra avec les données SAH + le tracking des actions.
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
