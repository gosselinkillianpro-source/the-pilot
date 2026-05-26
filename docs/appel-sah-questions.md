# Appel technique SAH — questions à poser

> **À qui** : la personne tech responsable de la plateforme SAH (CTO, lead dev, ou tech lead — pas un commercial).
>
> **Combien de temps prévoir** : 1 heure minimum. Ne te laisse pas embarquer dans un appel de 20 minutes — il y a beaucoup à caler.
>
> **Ce que tu veux à la fin de l'appel** :
> 1. Un mode d'accès aux données validé techniquement (webhook ? API ? CSV ? replica DB ?)
> 2. La liste exacte des champs qu'ils peuvent t'exposer pour chaque type de donnée (investisseurs, projets, souscriptions)
> 3. Un contact technique à qui écrire quand on aura besoin de quelque chose
> 4. Un engagement sur les délais (date à laquelle ils peuvent t'ouvrir l'accès)

---

## Avant l'appel — vocabulaire à comprendre

Pas besoin d'être expert, mais savoir ce que c'est t'aidera à comprendre leurs réponses.

| Mot | Ce que ça veut dire (analogie) |
|---|---|
| **API** (Application Programming Interface) | Un moyen pour notre app de poser des questions à leur app. C'est comme un guichet : on demande "donne-moi les investisseurs", ils répondent. |
| **Endpoint** | Une "porte" précise du guichet, avec une URL. Ex : `/api/investors/list`. |
| **Webhook** | L'inverse de l'API. C'est leur app qui nous prévient en temps réel quand un truc se passe (genre "nouveau inscrit !"). Comme un SMS push. |
| **Replica DB** (réplique de base) | Une copie en lecture seule de leur base de données, qu'on peut interroger directement. Très rapide, mais expose plus de données. |
| **CSV** | Un fichier tableur (comme Excel). Format simple, on en parle si pas mieux. |
| **OAuth / API key** | Le badge qui permet à THE PILOT de prouver son identité quand il appelle leur API. Comme une carte de fidélité. |
| **HMAC signature** | Une signature cryptographique sur les webhooks pour s'assurer que c'est vraiment SAH qui nous pousse la donnée, pas un imposteur. |
| **SLA** (Service Level Agreement) | L'engagement de disponibilité. "On garantit 99,9% de uptime" = autorisé à être down 8h par an max. |

---

## Section 1 — Mode d'accès aux données

C'est **la** question fondamentale. Tout le reste découle d'ici.

### Question 1.1 — Quelle méthode d'accès vous préconisez ?

**Ce que tu demandes** : "Pour qu'on récupère vos données chez THE PILOT, quelle méthode vous préconisez : (a) des webhooks que vous nous poussez, (b) une API REST que nous on appelle, (c) un accès en lecture à une réplique de votre base Postgres, ou (d) des exports CSV via S3 ou SFTP ?"

**Pourquoi je pose ça** : chaque méthode a ses trade-offs. Webhooks = temps réel, mais on rate des trucs s'ils tombent. API = on contrôle quand on appelle, mais charge sur leur infra. Replica = ultra-rapide mais ça expose plus. CSV = simple mais en différé (toutes les heures au mieux).

**Ce que tu veux entendre en réponse** : idéalement une combinaison "webhooks pour les événements temps réel (nouvelle inscription, KYC validé) + API REST pour les requêtes ponctuelles". CSV en fallback uniquement.

**Réponses qui posent problème** :
- "On n'a rien prévu, vous vous démerderez" → ⚠️ rouge vif, il va falloir construire ensemble
- "Uniquement des exports CSV mensuels" → 🟡 c'est trop lent pour le scoring temps réel
- "Replica Postgres direct" → 🟢 idéal pour nous, mais ils accepteront probablement pas pour des raisons sécu/perf

### Question 1.2 — Vous avez une doc technique de l'API ?

**Ce que tu demandes** : "Est-ce que vous avez une documentation technique de votre API (Swagger, OpenAPI, ou même un Notion) ? Si oui, peux-tu me l'envoyer après l'appel ?"

**Pourquoi je pose ça** : sans doc, on devine au pifomètre et on perd un temps fou.

**Si la réponse est "non, on a rien"** : demander combien de temps il leur faut pour écrire au moins une liste des endpoints disponibles.

### Question 1.3 — Quels endpoints / événements vous pouvez nous exposer ?

**Ce que tu demandes** : "Concrètement, qu'est-ce que vous pouvez nous donner ? Liste-moi les types de données accessibles (investisseurs, projets, souscriptions, etc.) et pour chacun, les actions qu'on peut faire (lister, lire un par ID, filtrer)."

**Ce que tu veux** : au minimum 5 endpoints / événements :
- Liste / détail d'un investisseur
- Liste / détail d'un projet immobilier
- Liste / détail d'une souscription
- Événements d'inscription (nouveau compte créé)
- Événements d'onboarding (carte d'identité validée par eux)

---

## Section 2 — Les champs exposés

C'est la liste précise des informations qu'on aura. **Important : prends des notes pendant qu'ils répondent.**

### Question 2.1 — Pour un investisseur, quels champs vous nous donnez ?

**Ce que tu demandes** : "Pour chaque investisseur, quels champs vous pouvez exposer ? Voici la liste de ce dont on a besoin, dis-moi pour chacun si c'est OK :"

Liste à lire :
- ID unique stable (qui ne change jamais)
- Email
- Prénom + Nom
- Téléphone
- Date de naissance
- Ville + code postal
- Date d'inscription (registration_complete = oui/non)
- Date d'onboarding terminé (carte uploadée, KYC validé chez eux = oui/non)
- Source d'acquisition (campagne pub, parrainage, organique…)
- Total déjà investi (€)
- Nombre de projets souscrits
- Dernière connexion / dernier login

**Ce qu'on NE veut PAS** (et important de le dire — moins on en a, mieux c'est) :
- ❌ Numéro de pièce d'identité
- ❌ RIB / IBAN
- ❌ Scan de pièce d'identité
- ❌ Mot de passe (évidemment)

**Pourquoi cette précision** : sécurité. Plus on en stocke, plus on est responsables en cas de fuite. Le KYC sensible reste chez eux, c'est leur travail (cadre ACPR).

### Question 2.2 — Pour un projet immobilier ?

**Ce que tu demandes** : "Pour chaque projet immobilier, quels champs vous pouvez exposer ?"

Liste :
- ID unique
- Nom du projet (ex: Brézins, Capsule)
- Statut (ouvert à la souscription, en cours, terminé…)
- Montant cible / montant collecté
- Rendement cible (%)
- Durée (en mois)
- Date d'ouverture / date prévue de fin
- Ville / région
- Type (marchand de biens, promotion, rénovation…)
- Description courte

### Question 2.3 — Pour une souscription ?

**Ce que tu demandes** : "Pour chaque souscription d'un investisseur à un projet, quels champs ?"

Liste :
- ID unique
- ID investisseur
- ID projet
- Montant souscrit
- Date de signature contrat
- Date de virement reçu
- Statut (signé, payé, en cours, remboursé)
- Date prévue de remboursement
- Date réelle de remboursement
- Montants remboursés (capital + intérêts)

---

## Section 3 — Sécurité du transfert

Tu **dois** insister sur cette section. C'est ton point de vigilance #1.

### Question 3.1 — Comment THE PILOT s'authentifie auprès de votre API ?

**Ce que tu demandes** : "Comment notre app va prouver son identité quand elle appelle votre API ? Vous utilisez des API keys, du OAuth, ou autre ?"

**Réponse attendue** : OAuth 2.0 avec un "system user" (compte technique dédié) OU une API key longue + secret, à stocker en variable d'environnement chez nous (jamais dans le code).

**Si la réponse est "on a pas, on filtre par IP"** : ⚠️ insuffisant, demander une vraie auth en plus.

### Question 3.2 — Les webhooks sont signés ?

**Ce que tu demandes** : "Quand vous nous pousserez des webhooks, ils seront signés cryptographiquement (HMAC) pour qu'on puisse vérifier que c'est bien vous qui envoyez ?"

**Pourquoi** : sans signature, n'importe qui qui découvre l'URL de notre webhook peut nous envoyer de fausses données. C'est un trou de sécu énorme.

**Réponse attendue** : "Oui, HMAC-SHA256, on te fournira le secret à la connexion."

**Si la réponse est non** : demander qu'ils l'implémentent. C'est un standard, pas un truc exotique.

### Question 3.3 — Chiffrement en transit ?

**Ce que tu demandes** : "Tout passe bien en HTTPS / TLS, y compris les CSV éventuels ?"

**Réponse attendue** : oui, évidemment. Si non, c'est rédhibitoire.

### Question 3.4 — Vous avez besoin de whitelister notre IP ?

**Ce que tu demandes** : "Est-ce que vous avez besoin que je vous donne nos IPs de production (Vercel Frankfurt) pour que vous nous autorisiez à appeler votre API ?"

**Pourquoi** : ça rajoute une couche de sécu (même si quelqu'un vole nos API keys, il pourra rien faire depuis une autre IP).

---

## Section 4 — Fréquence et latence

### Question 4.1 — En temps réel ou en batch ?

**Ce que tu demandes** : "Quels événements vous pouvez nous notifier en temps réel par webhook, et quels autres en batch (genre 1 fois par jour) ?"

**Ce qu'on veut en temps réel** (pour le scoring "prêt à investir") :
- Nouvelle inscription
- Onboarding complété (KYC validé)
- Nouvelle souscription
- Investisseur qui se connecte (last_login)

**Ce qu'on accepte en batch** (1x/jour, voire 1x/heure) :
- Recalcul des totaux investis
- Updates de statut de projets

### Question 4.2 — Quel délai max entre l'événement et la notif ?

**Ce que tu demandes** : "Si quelqu'un termine son onboarding à 14h32, à quelle heure on aura la notif ?"

**Réponse acceptable** : moins de 5 minutes pour le real-time. Si c'est plus, on perd l'effet "lead chaud".

---

## Section 5 — Le démarrage : importer les 2650+ déjà inscrits

### Question 5.1 — Comment on bootstrap nos données ?

**Ce que tu demandes** : "Au moment où on lance THE PILOT, on doit récupérer tous les investisseurs déjà inscrits chez vous (les 2650+) et tous les projets historiques. Vous pouvez nous faire un export one-shot ? Format ?"

**Réponse attendue** : un export CSV ou JSON, transféré via S3 EU ou SFTP. PAS par email (sécurité).

---

## Section 6 — Quand ça plante

### Question 6.1 — Si vous tombez, on fait quoi ?

**Ce que tu demandes** : "Si votre API ou vos webhooks tombent pendant 2h, qu'est-ce qui se passe ? Les événements qu'on a ratés, vous les renvoyez automatiquement ? Vous avez un endpoint pour qu'on rattrape ?"

**Réponse attendue** : "Oui, retry automatique pendant 24h avec backoff exponentiel" + "Endpoint `/api/events/since?since=DATE` pour rattraper."

**Si la réponse est "ben tu nous demandes par email"** : c'est nul mais on fera avec. Important de le savoir.

### Question 6.2 — Health check / monitoring ?

**Ce que tu demandes** : "Vous avez un endpoint `/health` qu'on peut pinger toutes les 5 min pour vérifier que vous êtes up ?"

### Question 6.3 — Qui je contacte en cas d'incident ?

**Ce que tu demandes** : "Si à 23h un samedi soir y'a un truc qui plante côté intégration, je joins qui et comment ?"

**Réponse attendue** : un Slack partagé, un email d'astreinte, ou au moins un nom + tél.

---

## Section 7 — RGPD et conformité

C'est important parce qu'on traite des données personnelles.

### Question 7.1 — Sommes-nous sous-traitant ou responsable conjoint ?

**Ce que tu demandes** : "D'un point de vue RGPD, comment qualifie-t-on notre rôle ? Sous-traitant de SAH, ou responsable conjoint du traitement ?"

**Pourquoi** : ça change les obligations légales. Sous-traitant = on agit pour leur compte, ils sont les responsables. Co-responsable = on partage les responsabilités.

**Réponse probable** : sous-traitant. C'est plus simple pour nous.

### Question 7.2 — Faut-il un DPA (Data Processing Agreement) ?

**Ce que tu demandes** : "On va devoir signer un DPA — Data Processing Agreement — entre vos sociétés et BREACH/Killian ? Si oui, qui le rédige ?"

**Pourquoi** : c'est un contrat obligatoire entre responsable de traitement et sous-traitant sous RGPD. Sans ça, on est en infraction.

**Réponse attendue** : "Oui, on a un modèle, on te l'envoie après l'appel." Si la réponse est "C'est quoi un DPA ?" → ⚠️ ils ne sont pas matures sur RGPD, à creuser.

### Question 7.3 — Droit à l'oubli inter-systèmes

**Ce que tu demandes** : "Si un investisseur exerce son droit à l'effacement (RGPD article 17) auprès de vous, comment vous nous notifiez pour qu'on supprime aussi nos données ?"

**Réponse attendue** : un webhook dédié `user.deletion_requested` ou un endpoint dédié.

### Question 7.4 — Hébergement

**Ce que tu demandes** : "Vous êtes bien hébergés en UE ? Aucune donnée d'investisseur ne sort de l'UE ?"

**Réponse attendue** : oui, EU only.

---

## Section 8 — Évolution

### Question 8.1 — Versioning de l'API

**Ce que tu demandes** : "Si vous changez un endpoint, comment vous gérez la rétro-compatibilité ? Vous versionnez (genre `/api/v1/`, `/api/v2/`) ?"

### Question 8.2 — Préavis sur les changements

**Ce que tu demandes** : "Quel préavis vous nous donnez si vous changez un format de données ou un endpoint ?"

**Réponse acceptable** : 2 semaines minimum.

---

## Récap — ce que tu dois ramener de l'appel

À la fin, tu dois avoir noté :

- ✅ La méthode d'accès retenue (probable : webhooks + API REST)
- ✅ La liste exhaustive des champs disponibles (investisseur, projet, souscription)
- ✅ La méthode d'authentification (probable : OAuth + API key)
- ✅ Confirmation des webhooks signés HMAC
- ✅ Délais sur le real-time (moins de 5 min)
- ✅ Méthode pour l'initial bulk load (probable : CSV via S3 EU)
- ✅ Mécanisme de retry + endpoint rattrapage
- ✅ Contact technique (nom, email, télé)
- ✅ Engagement sur la fourniture du DPA
- ✅ Confirmation hébergement EU
- ✅ Date à laquelle ils peuvent t'ouvrir l'accès (au moins en environnement de test)

---

## Phrases utiles si tu te sens dépassé pendant l'appel

- "Tu peux m'expliquer ça plus simplement ?"
- "Je note, je reviendrai vers toi par écrit pour vérifier que j'ai bien compris."
- "C'est noté, je vais en discuter avec mon équipe technique et je te reviens."
- "On peut planifier un deuxième call pour aller plus loin sur la partie technique ?"

Pas de honte à pas tout comprendre en direct — l'important est de capter les grandes lignes et de **prendre des notes**. Tu peux toujours valider avec moi après.

---

## Après l'appel

Envoie-moi tes notes (même brouillonnes), je transforme ça en spec technique propre + en doc d'intégration dans `docs/INTEGRATIONS.md`.
