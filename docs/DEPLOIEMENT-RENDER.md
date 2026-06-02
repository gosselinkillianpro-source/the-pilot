# Déploiement THE PILOT sur Render (EU)

> But : mettre THE PILOT en ligne sur un serveur EU avec une **IP de sortie fixe** à
> communiquer à Seven At Home (pour l'accès lecture seule à leur réplique de base).
> Région : **Frankfurt** (Union Européenne, RGPD).

---

## Vue d'ensemble (qui fait quoi)

- **Toi** : créer les comptes (GitHub, Render), coller les secrets, activer l'IP fixe, payer.
- **Moi (Claude)** : la config (`render.yaml`, versions), les commandes Git, la vérif.

---

## Étape 1 — Mettre le code sur GitHub (privé)

Render déploie depuis un dépôt GitHub.

1. Crée un compte sur **github.com** (si pas déjà fait).
2. Crée un **nouveau dépôt privé** (bouton « New ») nommé `the-pilot`. **Ne coche rien** (pas de README/gitignore — le projet en a déjà). Laisse-le vide.
3. Reviens me voir : je lance les commandes pour **envoyer ton code dessus** (`git remote add` + `git push`). Tu n'auras qu'à te connecter à GitHub si on te le demande.

> ⚠️ Le dépôt doit être **privé** (le code contient la logique métier de SAH). Les secrets, eux, ne sont jamais dans le code (ils sont dans `.env.local`, ignoré par Git).

---

## Étape 2 — Créer le service sur Render

1. Crée un compte sur **render.com** (avec un moyen de paiement).
2. **New → Blueprint** → connecte ton compte GitHub → choisis le dépôt `the-pilot`.
3. Render lit automatiquement le fichier **`render.yaml`** (déjà dans le projet) : service web, région **Frankfurt**, build/start configurés. Tu n'as rien à régler ici.

---

## Étape 3 — Coller les variables d'environnement (secrets)

Dans Render, le Blueprint va te demander chaque secret (ils ne sont PAS dans le code).
Recopie les valeurs depuis ton fichier **`.env.local`**. Liste exacte :

| Variable | D'où vient la valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` |
| `DATABASE_URL` | `.env.local` |
| `BREVO_API_KEY` | `.env.local` |
| `BREVO_WEBHOOK_SECRET` | `.env.local` |
| `EMAIL_TEST_MODE` | **`true`** (on garde le mode test en prod au début !) |
| `EMAIL_TEST_ADDRESS` | `.env.local` |
| `EMAIL_SENDER_NAME` | `.env.local` |
| `EMAIL_SENDER_ADDRESS` | `.env.local` |
| `NEXT_PUBLIC_EMAIL_LOGO_URL` | `.env.local` |
| `NEXT_PUBLIC_APP_URL` | l'URL Render (ex: `https://the-pilot.onrender.com`) — à mettre après le 1er déploiement |
| `ANTHROPIC_API_KEY` | `.env.local` |
| `OPENROUTER_API_KEY` | `.env.local` |
| `OPENROUTER_GROK_MODEL` | `.env.local` |
| `OPENROUTER_IMAGE_MODEL` | `.env.local` |

> 🔒 **NE PAS mettre `DISABLE_AUTH`** sur Render. En prod l'auth doit être ACTIVE.
> (De toute façon, `NODE_ENV=production` la force activée même si la variable traînait.)
> `NODE_ENV=production` est déjà posé par `render.yaml`.

---

## Étape 4 — Activer l'IP de sortie fixe (le point clé pour SAH)

Dans Render → ton service → **Settings → Outbound → Static Outbound IP Addresses** (selon le plan, peut nécessiter l'activation de la fonctionnalité). Render te donne **une ou plusieurs IP fixes**.

➡️ **Ce sont CES IP que tu communiques à Seven At Home** pour qu'ils les autorisent (whitelist) sur leur réplique.

---

## Étape 5 — Déployer et vérifier

1. Lance le déploiement (Render le fait au 1er coup, puis à chaque `git push`).
2. Une fois en ligne, ouvre l'URL Render : tu dois arriver sur **la page de connexion** (l'auth est active en prod 👍).
3. Connecte-toi avec ton compte admin + 2FA.
4. Mets à jour `NEXT_PUBLIC_APP_URL` avec l'URL Render et redéploie.

---

## Étape 6 — Donner les infos à SAH + brancher le webhook Brevo

- **À SAH** : transmets les **IP fixes** (étape 4) pour l'accès à leur réplique.
- **Webhook Brevo** : maintenant que l'app a une vraie adresse publique, configure dans
  Brevo → Webhooks l'URL : `https://<ton-url-render>/api/webhooks/brevo?token=<BREVO_WEBHOOK_SECRET>`.

---

## Notes importantes

- **Base de données** : la prod utilise le **même Supabase** que le local (déjà migré). Rien à recréer.
- **Emails** : `EMAIL_TEST_MODE=true` au départ → aucun email réel ne part, même en ligne. On le passera à `false` quand tu seras prêt.
- **Réactivation de l'auth** : automatique en prod (rien à faire). En local elle reste désactivée (`DISABLE_AUTH=true`).
- **Sync SAH** : une fois l'accès réplique obtenu, je construirai le job de synchronisation (réplique SAH → Supabase). C'est l'étape suivante après l'hébergement.
