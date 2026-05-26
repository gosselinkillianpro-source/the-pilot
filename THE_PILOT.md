# THE PILOT — Documentation projet complète

> **Pour Claude Code** : ce document est la bible du projet. À lire en intégralité avant toute session de dev. Toute décision technique, architecturale ou métier qui n'est pas dans ce document doit être posée à Killian avant d'être implémentée. Ne JAMAIS supposer, deviner, ou improviser sur les sujets de conformité (AMF, RGPD), de sécurité, ou de data model.

> **Statut** : Spécification v1.0 — Mise à jour : mai 2026 — Owner : Killian (BREACH) — Client : Seven At Home (SAH)

---

## Sommaire

- [1. Identité et vision du projet](#1-identité-et-vision-du-projet)
- [2. Contexte business : Seven At Home](#2-contexte-business--seven-at-home)
- [3. Personas utilisateurs](#3-personas-utilisateurs)
- [4. Le problème résolu](#4-le-problème-résolu)
- [5. Philosophie produit et principes directeurs](#5-philosophie-produit-et-principes-directeurs)
- [6. Architecture fonctionnelle : les 5 modules](#6-architecture-fonctionnelle--les-5-modules)
- [7. Le rôle de l'IA et les garde-fous obligatoires](#7-le-rôle-de-lia-et-les-garde-fous-obligatoires)
- [8. Stack technique](#8-stack-technique)
- [9. Architecture technique détaillée](#9-architecture-technique-détaillée)
- [10. Data model complet](#10-data-model-complet)
- [11. Intégrations externes](#11-intégrations-externes)
- [12. Sécurité et conformité réglementaire](#12-sécurité-et-conformité-réglementaire)
- [13. Conventions de code](#13-conventions-de-code)
- [14. Structure du repository](#14-structure-du-repository)
- [15. Workflow Git, CI/CD et déploiement](#15-workflow-git-cicd-et-déploiement)
- [16. Roadmap par versions](#16-roadmap-par-versions)
- [17. System prompts des agents IA](#17-system-prompts-des-agents-ia)
- [18. Patterns critiques avec exemples de code](#18-patterns-critiques-avec-exemples-de-code)
- [19. Glossaire métier](#19-glossaire-métier)
- [20. Risques connus et mitigations](#20-risques-connus-et-mitigations)
- [21. Comment Claude Code doit travailler sur ce projet](#21-comment-claude-code-doit-travailler-sur-ce-projet)

---

## 1. Identité et vision du projet

### Nom du produit
**THE PILOT**

### Tagline
La cabine de pilotage marketing 360 propulsée par IA, construite sur-mesure pour Seven At Home.

### Vision en une phrase
Transformer Seven At Home d'une plateforme pilotée à l'instinct en une machine de pilotage data-driven, où chaque investisseur est suivi, chaque action est mesurée, et où l'IA propose en continu les bonnes actions pour maximiser la collecte et la rentabilité.

### Mission
Centraliser toute l'opérationnel marketing, closing et data dans une application unique, augmentée par une couche IA qui pense, analyse, propose et exécute (avec validation humaine quand nécessaire).

### Objectif business chiffré
Permettre à SAH de passer de **~100K€/mois** de collecte actuelle à **300K€/mois** à 12 mois, sans tripler les effectifs et sans tripler le budget marketing.

### Owner et commanditaire
- **Owner produit / lead dev** : Killian, marketing director SAH via BREACH (agence)
- **Commanditaire** : Stéphane Madryga (fondateur SAH, co-associé sur le deal)
- **Modèle commercial** : licence SAH 5K€/mois (en plus du retainer marketing 20K/mois). IP chez BREACH.

---

## 2. Contexte business : Seven At Home

### Identité de SAH
- **Raison sociale** : Seven Capital Invest SA
- **RCS** : Romans 943832543
- **Marque commerciale** : Seven At Home (SAH)
- **Type de produit** : plateforme privée de **club deal immobilier**
- **Positionnement légal** : club deal immobilier privé sous framework AMF DIS, KYC ACPR
- **Activité** : collecte d'épargne auprès d'investisseurs particuliers pour financer des opérations immobilières (marchand de biens) opérées en interne par Stéphane Madryga

### Personnages clés
- **Stéphane Madryga** : fondateur, marchand de biens, source et opère tous les projets, face publique sur les vidéos
- **Guillaume Gosselin** : co-fondateur, CGP certifié, en charge des appels et RDV investisseurs. Calendly : `calendly.com/g-gosselin-sevenathome/30min`. Closer principal.
- **Céline Charignon** : Présidente de Seven Capital Invest SA
- **Killian** : marketing director via BREACH (agence). 1 jour SAH/semaine + daily check-ins. Lead dev de THE PILOT.

### Chiffres clés actuels (mai 2026)
- 36 projets complétés, 100% des yields cibles atteints
- 2 650+ investisseurs inscrits
- 23M€+ collectés depuis création
- 6 projets actifs au moment de la rédaction (Montbonnot, Chambéry, Brézins, Haras, Capsule, Moirans)
- Yield cible standard : **15%/an** (1,25%/mois), durée projets 4 à 24 mois

### Le modèle économique de SAH
- L'investisseur souscrit à un projet pour une durée donnée (4 à 24 mois)
- SAH/Stéphane opère le projet immobilier (achat → travaux → revente)
- En fin de projet, l'investisseur récupère son capital + le rendement
- **Marge SAH typique : 20%** sur la collecte (cumul frais de structuration, commission de performance, marge sur l'opération marchand de biens)

### Cadre réglementaire à respecter EN PERMANENCE
- **AMF DIS (Document d'Information Synthétique)** : tout document commercial doit respecter les termes AMF
- **ACPR KYC** : vérification d'identité et de capacité financière obligatoire avant souscription
- **RGPD** : hébergement EU obligatoire, droit à l'oubli, registre des traitements, etc.
- **Démarchage financier** : encadré par le Code Monétaire et Financier. Opt-in explicite obligatoire pour tout démarchage actif.

### Termes interdits dans toute communication SAH (AMF non-négociable)
- ❌ "garanti" / "garantie" (sauf mention "non garanti")
- ❌ "sans risque" / "risque zéro"
- ❌ "sûr" / "assuré" en parlant du rendement
- ❌ "certain" en parlant du rendement
- ❌ "crowdfunding" / "financement participatif" (réservé aux PSFP-agrément, SAH ne l'est pas)

### Termes obligatoires
- ✅ "rendement cible" (jamais "rendement garanti")
- ✅ "capital non garanti" (sur toute mention de rendement)
- ✅ "club deal immobilier privé" (positionnement officiel)

### Le funnel actuel de SAH (à modéliser dans THE PILOT)
1. **Acquisition** : Meta Ads, Google Ads, LinkedIn Ads, SEO, social organique, RP, parrainage
2. **Inscription** : création de compte sur `app.sevenathome.com`, validation email
3. **KYC** : validation d'identité + capacité financière via le dashboard SAH
4. **Premier projet** : sélection d'un projet, signature contrat, virement
5. **Vie du projet** : reporting trimestriel, communication d'avancement
6. **Sortie / Réinvestissement** : retour des fonds + intérêts, opportunité de réinvestir

---

## 3. Personas utilisateurs

THE PILOT est multi-utilisateurs avec 4 rôles distincts. Chaque rôle a un dashboard, des permissions et un workflow différents.

### Persona 1 : Killian (Admin / Marketing Director)
- **Rôle système** : `admin`
- **Fréquence d'utilisation** : quotidienne, plusieurs heures/jour
- **Besoins principaux** :
  - Voir l'ensemble du funnel et du business en un coup d'œil
  - Piloter les campagnes ads multi-plateformes
  - Voir le ROI par canal d'acquisition et par campagne
  - Configurer les automatisations email et les règles
  - Gérer les utilisateurs, permissions, intégrations
  - Auditer la conformité AMF/RGPD
  - Accéder aux logs et exporter pour reporting
- **Permissions** : full access (RW sur tout)
- **Devices** : desktop principalement, mobile pour notifications

### Persona 2 : Guillaume (Closer principal)
- **Rôle système** : `closer`
- **Fréquence d'utilisation** : plusieurs fois par jour, en mobilité aussi
- **Besoins principaux** :
  - Voir son pipeline d'investisseurs à appeler, classés par priorité (score IA)
  - Lire un brief d'appel auto-généré avant chaque RDV (30 secondes max)
  - Enregistrer/transcrire les appels et avoir un récap automatique
  - Voir l'historique complet d'un investisseur en 1 clic
  - Envoyer une proposition post-appel sans re-saisir
  - Suivre ses KPIs personnels (taux de transfo, tickets moyens, etc.)
- **Permissions** : lecture sur ses leads attribués + ses propres logs, écriture sur les notes/actions de ses fiches
- **Devices** : mobile et desktop, switch fréquent

### Persona 3 : Closer junior (à venir, post-V1)
- **Rôle système** : `closer_junior`
- **Différences avec Guillaume** : ne voit que les leads à score modéré (lui laisse les hot leads), accès au coaching IA en temps réel pendant les appels
- **Permissions** : lecture sur ses leads attribués uniquement, écriture sur notes

### Persona 4 : Stéphane (Co-fondateur / Décideur)
- **Rôle système** : `executive`
- **Fréquence d'utilisation** : 1-2 fois par semaine pour reporting, possiblement quotidien via Pilot Concierge (WhatsApp)
- **Besoins principaux** :
  - Reporting global de la performance (collecte, marge, projets)
  - Vision pipeline projets en cours
  - Alertes sur dérives ou opportunités
  - Pas de besoin d'agir, juste de voir et décider
  - Accès Pilot Concierge via WhatsApp (V1.5) pour questions ad-hoc
- **Permissions** : read-only sur tout, sauf ses propres notes/réflexions

### Persona 5 : Céline (Présidente)
- **Rôle système** : `executive`
- **Fréquence d'utilisation** : 1x/mois (reporting board)
- **Besoins principaux** : conformité, reporting board, vue exécutive haute
- **Permissions** : read-only sur tout

### Matrix permissions (à implémenter via Supabase RLS)

| Resource | admin | closer | closer_junior | executive |
|---|---|---|---|---|
| Investisseurs (lecture) | tous | leads attribués | leads attribués | tous |
| Investisseurs (écriture notes) | tous | leads attribués | leads attribués | non |
| Investisseurs KYC sensibles | oui | masqué partiel | masqué partiel | masqué partiel |
| Campagnes ads | RW | non | non | lecture |
| Email flows | RW | non | non | lecture |
| Posts sociaux | RW | non | non | lecture |
| Dashboards globaux | oui | partiel | partiel | oui |
| Audit log | oui | non | non | lecture |
| Users & roles | oui | non | non | non |
| Settings & intégrations | oui | non | non | non |

---

## 4. Le problème résolu

THE PILOT s'attaque à quatre angles morts opérationnels qui limitent aujourd'hui la croissance de SAH.

### Angle mort #1 : Aucune visibilité fine sur le coût et le ROI par canal
SAH dépense 15K€/mois en ads (Meta + Google + LinkedIn) mais ne sait pas exactement quel canal génère quel investisseur ni le LTV de chaque cohorte d'acquisition. Le tracking actuel est en silos (Meta Ads Manager d'un côté, Brevo de l'autre, dashboard SAH encore ailleurs). Pas de jointure entre un clic ad et une souscription 3 mois plus tard.

### Angle mort #2 : Les leads chauds passent à travers
Chaque jour, des inscrits ouvrent des emails projet, visitent des pages, font des simulations. Personne ne les voit en temps réel. Guillaume ne peut prioriser que selon sa mémoire. Aucun signal automatique sur "prêt à investir". Résultat estimé : 30 à 50% des leads chauds ne sont pas rappelés au bon moment.

### Angle mort #3 : Le rebond perdu
Un investisseur qui termine un projet à 12 mois reçoit ses fonds + intérêts. C'est le moment optimal pour le réinvestir (capital disponible + relation positive). Aujourd'hui : aucun trigger automatique. L'argent part chez un concurrent (Anaxago, Homunity, Bricks) ou retourne sur un Livret A. Perte estimée : 40 à 60% des capitaux remboursés ne reviennent jamais sur SAH.

### Angle mort #4 : La conformité fragile à l'échelle
Aujourd'hui, le contrôle AMF des contenus se fait à l'œil par Killian. À 100K€/mois et 30 ads actives, ça passe. À 300K€/mois et 200 ads actives, c'est statistiquement impossible. Un seul mot interdit ("garanti", "sans risque") sur une campagne scalée, c'est un contrôle AMF qui s'invite.

---

## 5. Philosophie produit et principes directeurs

### Principe 1 : Human-in-the-loop sur toute décision affectant un investisseur
L'IA propose, l'humain décide. Pas de mail envoyé automatiquement à un investisseur sans validation. Pas d'appel déclenché sans qu'un closer ait validé. Pas de campagne ad mise en pause sans confirmation. Exception : les notifications internes peuvent être 100% auto.

### Principe 2 : Tout est traçable, tout est révocable
Chaque action a un audit log avec qui l'a fait, quand, depuis quelle IP. Chaque modification est versionnée et peut être rollback. Pas d'opération destructive sans confirmation explicite.

### Principe 3 : Données sensibles cloisonnées
KYC, fiscalité, identité civile : visibles uniquement par les rôles autorisés et masqués par défaut dans les vues (un closer voit "Jean D." pas "Jean Dupont 1985-03-22 92 av. Foch Paris"). Affichage complet sur clic explicite + audit.

### Principe 4 : L'app doit tourner sans moi
Killian construit THE PILOT mais doit pouvoir prendre 3 semaines de vacances sans rien casser. Donc : pas de dépendance cachée à des secrets locaux, pas de scripts manuels critiques, monitoring automatique avec alertes.

### Principe 5 : Performance perçue > performance théorique
Toute action utilisateur doit donner un feedback en moins de 100ms. Les calculs lourds (scoring IA, attribution) tournent en async en background et notifient quand prêts. Jamais de loader bloquant > 3 secondes.

### Principe 6 : Conformité AMF est non-négociable dans le code
Tout contenu généré qui contient `["garanti", "sans risque", "crowdfunding", "financement participatif", "sûr", "certain", "assuré"]` dans un email/ad/post est bloqué côté backend avant envoi. Pas négociable. Liste extensible dans la config.

### Principe 7 : Mobile-first sur les workflows closers
Guillaume bosse souvent en mobilité. Le tool closers doit être 100% utilisable au téléphone. Pas une version dégradée, la même.

### Principe 8 : Pas d'over-engineering en V1
Multi-tenant, white-label, internationalisation : sont des sujets V2/V3. La V1 est mono-tenant SAH uniquement. Architecture pensée pour évoluer, mais pas surdimensionnée d'entrée.

---

## 6. Architecture fonctionnelle : les 5 modules

THE PILOT est structuré en 5 modules métier + 1 couche transverse IA. Chaque module a son propre namespace de routes, ses propres tables principales, et ses propres permissions.

### Module 1 : Closing Engine (le CRM closers)
**Namespace** : `/closing` — **Routes principales** : `/closing/pipeline`, `/closing/investor/[id]`, `/closing/calls`

**Sous-fonctionnalités V1** :
- Pipeline kanban par closer (colonnes : Inscrit, Contacté, RDV pris, RDV fait, Proposition envoyée, Closed)
- Fiche investisseur enrichie (profil, historique, comportement web, communications)
- Scoring IA "prêt à investir" (0-100), recalculé à chaque événement
- Brief d'appel auto-généré avant chaque RDV (contexte + script suggéré + objections probables)
- Transcription automatique des appels via Whisper (avec consentement explicite)
- Extraction post-appel : objections, intérêts, montant évoqué, prochaine action
- Pipeline visuel avec SLA par étape (alerte si lead stagne > X jours)
- Multi-canal centralisé (notes téléphone, LinkedIn DM, WhatsApp, email perso) tracé dans la fiche
- Trigger "rebond 11 mois" : 30 jours avant la fin d'un projet, l'investisseur est automatiquement push dans la pipeline du closer avec brief de réinvestissement

**Sous-fonctionnalités V2** :
- Coaching IA en temps réel pendant les appels (suggestions d'arguments live)
- Prédiction de churn investisseur (qui va ne pas réinvestir)
- Attribution automatique de la souscription au touchpoint qui l'a déclenchée

### Module 2 : Email Reactor (moteur d'automation enrichi)
**Namespace** : `/email` — **Routes principales** : `/email/flows`, `/email/segments`, `/email/templates`

**Sous-fonctionnalités V1** :
- Builder visuel de workflows avec triggers + conditions multi-critères croisées
- Connexion Brevo API en bidirectionnel (envoi via Brevo, tracking côté nous)
- Segments dynamiques basés sur : profil + comportement + historique + signaux faibles
- Génération IA du contenu personnalisé par segment (avec validation humaine obligatoire)
- Prédiction du meilleur moment d'envoi par contact (ML simple sur historique d'ouverture)
- Détection automatique des "leads chauds" (3 ouvertures + 2 clics sur projet X en 7j → push CRM)
- Templates AMF-safe pré-validés
- A/B testing avec détection statistique de significativité

**Sous-fonctionnalités V2** :
- Predictive churn et séquences de réactivation
- Personnalisation par individu (pas seulement par segment) via génération IA en temps réel
- Multi-canal au-delà de l'email (SMS via Brevo, WhatsApp Business)

### Module 3 : Social Hub (gestion sociale + veille)
**Namespace** : `/social` — **Routes principales** : `/social/competitive`, `/social/calendar`, `/social/inbox`

**Sous-fonctionnalités V1** :
- Veille concurrentielle automatisée (scraping quotidien LinkedIn + Instagram des concurrents nommés : Anaxago, Homunity, Bricks, La Première Brique, ClubFunding, Raizers, Wesharebonds)
- Détection des posts à fort engagement chez les concurrents (alerte + analyse)
- Tableau comparatif hebdo (cadence, sujets, performance)

**Sous-fonctionnalités V2** :
- Génération auto de posts à partir des événements SAH (nouveau projet → 3 variantes)
- Calendrier de publication multi-plateformes (LinkedIn, Insta, X)
- Inbox unifiée (commentaires LinkedIn + Insta + Facebook + Insta DM)
- Réponses IA avec validation 1 clic
- Détection auto des leads dans les DM et push CRM
- Analyse de sentiment + alertes sur pic négatif

### Module 4 : Ads Control (cockpit campagnes)
**Namespace** : `/ads` — **Routes principales** : `/ads/dashboard`, `/ads/campaigns`, `/ads/creatives`

**Sous-fonctionnalités V1** :
- Vue consolidée Meta Ads + Google Ads + LinkedIn Ads en lecture
- KPIs unifiés (CPM, CPC, CTR, CPA blended, ROAS)
- Détection automatique des copies non-conformes AMF avant publication (scan + alerte)
- Audit log de chaque modification de campagne

**Sous-fonctionnalités V2** :
- Attribution multi-touch data-driven (du clic à la souscription)
- Recommandations IA d'optimisation budget en temps réel
- Détection des problèmes en live (CPM qui explose, audience saturée, QS Google qui baisse)
- Génération auto de variants à partir des top-performers
- Auto-pause sur seuils configurables (avec alerte humaine)

### Module 5 : Performance Lab (analytics et reporting)
**Namespace** : `/performance` — **Routes principales** : `/performance/overview`, `/performance/cohorts`, `/performance/ltv`

**Sous-fonctionnalités V1** :
- Dashboard global personnalisé par rôle
- KPIs clés en temps réel : collecte mois, ticket moyen, CPA blended, nb inscrits
- Reporting auto mensuel en PDF (envoyé à Stéphane, Céline, Killian, Guillaume)
- Comparaisons M vs M-1, vs cible, projections fin de mois

**Sous-fonctionnalités V2** :
- LTV réel par canal d'acquisition sur 24 mois glissants
- Modèle de cohortes (identifier les périodes cassées)
- Forecasting cash-flow plateforme à 12 mois avec scénarios
- Détection automatique des projets sous-performants
- Drill-down par canal, par projet, par cohorte

### Couche transverse : The Brain (orchestration IA)
**Namespace** : `/brain` — **Composant** : agent IA disponible dans toutes les vues

**Sous-fonctionnalités V1** :
- Chat with your data en langage naturel sur la base (lecture seule)
- Génération de recos contextuelles par module (in-page suggestions)
- Scoring IA "prêt à investir" recalculé en continu
- Détection des signaux faibles (cross-module)

**Sous-fonctionnalités V1.5 (Pilot Concierge)** :
- Agent WhatsApp pour Stéphane (questions ad-hoc en langage naturel)
- Auth par code à 4 chiffres toutes les 4h d'inactivité
- Read-only sur les data SAH

**Sous-fonctionnalités V2** :
- Chat with your data avec génération de charts à la volée
- Agent pro-actif (push d'insights non-demandés mais pertinents)

---

## 7. Le rôle de l'IA et les garde-fous obligatoires

### Où l'IA intervient dans THE PILOT
1. **Scoring d'investisseurs** : modèle qui produit un score 0-100 pour chaque inscrit
2. **Génération de contenu** : emails personnalisés, briefs d'appels, posts sociaux, réponses commentaires
3. **Analyse d'appels** : transcription Whisper + extraction d'intentions via LLM
4. **Détection AMF** : scan des copies avant publication
5. **Veille concurrentielle** : analyse des posts concurrents (engagement, thèmes)
6. **Chat with your data** : agent qui répond en langage naturel
7. **Recos contextuelles** : suggestions d'actions par module

### Garde-fous OBLIGATOIRES (à enforce dans le code)

**Garde-fou 1 : Human-in-the-loop sur les communications externes**
Tout contenu généré qui sera envoyé à un investisseur (email, message, post) DOIT passer par une étape de validation humaine. Le code rejette toute action de type "send" qui n'a pas un `validated_by` user_id et un `validated_at` timestamp.

```typescript
// Pattern obligatoire avant tout envoi externe
async function sendToInvestor(content: GeneratedContent) {
  if (!content.validated_by || !content.validated_at) {
    throw new Error('UNVALIDATED_CONTENT_BLOCKED: every external comm needs human approval');
  }
  // ... puis envoi
}
```

**Garde-fou 2 : AMF compliance scan automatique**
Tout texte généré par l'IA destiné à être lu par un investisseur (ou un prospect) passe par un scanner de termes interdits AVANT d'être affiché à l'utilisateur pour validation. Si match : flag rouge sur le contenu + le validateur humain doit confirmer expressément.

Voir [Section 18 - Patterns critiques](#18-patterns-critiques-avec-exemples-de-code) pour l'implémentation.

**Garde-fou 3 : RGPD Article 22 — pas de décision auto significative**
Aucune décision automatisée affectant significativement un investisseur (ex : "ne plus jamais lui envoyer d'emails", "le classer en lost cause", "le démarcher en priorité") sans :
- Soit validation humaine
- Soit transparence : la personne doit pouvoir savoir qu'elle est profilée et avoir droit de contestation

**Garde-fou 4 : Pas d'hallucinations sur les chiffres**
Le chat IA et tous les agents qui répondent sur des données financières DOIVENT requêter la base et citer la source. Interdit de répondre depuis la connaissance générale. Si le LLM ne peut pas requêter, il répond "je n'ai pas l'info, va voir dans le dashboard X".

**Garde-fou 5 : Logging IA exhaustif**
Chaque appel à un LLM (Anthropic, OpenAI) doit être loggé en base avec : prompt, response, tokens utilisés, coût estimé, user_id qui a déclenché, action qui en a résulté. Pour audit et debug.

**Garde-fou 6 : Coût IA borné**
Limit configurable par utilisateur et par jour sur les tokens IA. Au-delà, alerte admin + soft-block. Évite qu'un bug en boucle ne consomme 500€ d'API en une nuit.

**Garde-fou 7 : Pas de KYC dans les prompts**
Les données KYC sensibles (numéro de pièce d'identité, RIB, etc.) NE DOIVENT JAMAIS être envoyées dans un prompt LLM. Seulement des métadonnées (statut KYC validé : oui/non, tranche de revenu, etc.).

---

## 8. Stack technique

### Frontend
- **Framework** : Next.js 16 (App Router, React Server Components, Turbopack par défaut)
- **Langage** : TypeScript strict mode
- **UI** : shadcn/ui + Tailwind CSS 4
- **State client** : Zustand (simple) ou Jotai (atomic) selon besoin
- **State serveur** : React Server Components + Server Actions, fallback TanStack Query pour les cas dynamiques
- **Forms** : React Hook Form + Zod (validation)
- **Charts** : Recharts (par défaut), D3 si visualisations très custom
- **Tables** : TanStack Table v8
- **Editor riche (templates email)** : Tiptap
- **Animations** : Framer Motion (parcimonieux)
- **Toasts/notifs** : Sonner

### Backend
- **Pas de backend séparé** : tout passe par Next.js App Router (Route Handlers + Server Actions)
- **Background jobs** : Vercel Cron (jobs simples) + Inngest (jobs complexes avec retry, fan-out, durable workflows)
- **Workflows externes lourds** : n8n self-hosted sur Hetzner (5€/mois, instance dédiée) — pour les scrapings, polling concurrents, etc.

### Base de données et auth
- **Database** : PostgreSQL via Supabase (hébergement Frankfurt EU)
- **Auth** : Supabase Auth + SSO Google/Microsoft pour les utilisateurs internes
- **RLS (Row Level Security)** : activée sur TOUTES les tables, pas d'exception
- **Realtime** : Supabase Realtime pour les notifications push in-app
- **Storage** : Supabase Storage pour fichiers (audio appels, exports PDF, attachements)

### Services IA
- **LLM principal** : Anthropic Claude (via API directe, pas via Claude.ai)
  - Modèle par défaut : `claude-opus-4-7` pour les tâches complexes (analyse, génération longue)
  - Modèle rapide : `claude-haiku-4-5-20251001` pour les tâches simples (scoring, classification)
- **LLM secondaire (fallback)** : OpenAI GPT (juste en backup si Anthropic indispo)
- **Speech-to-text** : OpenAI Whisper API pour la transcription des appels
- **Embeddings** : OpenAI text-embedding-3-large pour la recherche sémantique (V2)
- **Vector store** : pgvector dans Supabase (Postgres natif)

### Intégrations externes (API)
- **Brevo API v3** : envoi emails, gestion contacts, automations basiques
- **Meta Marketing API v19** : campagnes, ad sets, ads, insights, audiences
- **Google Ads API v17** : campagnes Search + Performance Max
- **LinkedIn Marketing API** : campagnes (read-only en V1, plus complexe à scaler)
- **Calendly API v2** : sync RDV de Guillaume
- **WhatsApp Business API** (Meta Cloud API) : pour Pilot Concierge V1.5
- **Trustpilot API** : sollicitation avis post-souscription

### Infra et déploiement
- **Hosting frontend/API** : Vercel (région EU/Frankfurt fra1)
- **CDN** : Cloudflare devant Vercel (Cloudflare Access pour Zero Trust)
- **Monitoring** : Sentry (errors) + Vercel Analytics (perf) + Better Stack (uptime)
- **CI/CD** : GitHub Actions (lint + typecheck + tests sur PR, deploy auto via Vercel)
- **Secrets management** : Vercel Env Variables + Doppler pour la sync multi-env

### Stack outils dev
- **IDE** : Cursor (Killian) + Claude Code Max (Killian) — l'ami dev sur ce qu'il préfère
- **Versioning** : Git + GitHub (repo privé `sah-ops` ou `the-pilot`)
- **Issue tracking** : Linear (10€/seat/mois ou gratuit ≤250 issues)
- **Documentation** : Notion (partagé)
- **Secrets sharing** : 1Password Teams (8€/user/mois)
- **Communication** : Slack ou Discord privé

---

## 9. Architecture technique détaillée

### Vue d'ensemble (high-level)

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT                              │
│  Next.js 16 App (React Server Components + Client)          │
│  - Dashboards par rôle                                       │
│  - Pipeline closer kanban                                    │
│  - Email flow builder                                        │
│  - Settings & integrations                                   │
└────────────┬────────────────────────────────────────────────┘
             │ HTTPS
             ▼
┌─────────────────────────────────────────────────────────────┐
│                  EDGE / MIDDLEWARE                          │
│  Cloudflare Access (Zero Trust) → Vercel Edge               │
│  - Auth check, rate limiting, CSRF                          │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│           NEXT.JS API (Route Handlers + Server Actions)     │
│  - /api/closing/* — pipeline, fiche, brief                  │
│  - /api/email/* — flows, segments, send                     │
│  - /api/ads/* — sync Meta/Google, KPIs                      │
│  - /api/brain/* — IA agent, chat with data                  │
│  - /api/whatsapp/webhook — Pilot Concierge V1.5             │
└────────────┬────────────────────────────────────────────────┘
             │
             ├─────────────────┐
             ▼                 ▼
┌───────────────────┐  ┌───────────────────┐
│   SUPABASE EU     │  │   EXTERNAL APIs   │
│ - Postgres + RLS  │  │ - Brevo           │
│ - Auth            │  │ - Meta Ads        │
│ - Realtime        │  │ - Google Ads      │
│ - Storage         │  │ - LinkedIn Ads    │
│ - pgvector        │  │ - Calendly        │
└───────────────────┘  │ - WhatsApp BSP    │
                       │ - Anthropic API   │
                       │ - OpenAI Whisper  │
                       └───────────────────┘
                                ▲
                                │
                       ┌────────┴──────────┐
                       │   BACKGROUND      │
                       │   - Vercel Cron   │
                       │   - Inngest       │
                       │   - n8n (Hetzner) │
                       └───────────────────┘
```

### Flow type : un investisseur s'inscrit
1. L'utilisateur s'inscrit sur `app.sevenathome.com` (app SAH existante, pas THE PILOT)
2. Webhook envoyé par l'app SAH vers `https://the-pilot.sevenathome.io/api/webhooks/sah/investor-created`
3. THE PILOT enregistre l'investisseur dans sa table `investors` (READ-ONLY mirror)
4. Inngest job déclenché : `scoring.recalculate({investorId})` qui appelle l'API Claude pour calculer le score initial
5. Si score > 60 : push automatique dans la pipeline du closer le moins chargé
6. Notification realtime Supabase au closer concerné

### Flow type : un closer appelle un investisseur
1. Guillaume ouvre la fiche depuis son pipeline kanban
2. Front fetch : `/api/closing/investor/[id]` (server action)
3. Le serveur récupère : fiche + historique + brief IA (généré on-the-fly si stale)
4. Affichage du brief en moins de 500ms
5. Guillaume clique "Démarrer l'appel" → call link tel: (mobile) ou Aircall/CTI (desktop)
6. Pendant l'appel : enregistrement audio uploadé via Supabase Storage (avec consentement coché AVANT)
7. Post-appel : Inngest job `call.process({callId})` qui :
   - Envoie l'audio à Whisper pour transcription
   - Passe la transcription à Claude pour extraction (intentions, objections, montant, prochaine action)
   - Met à jour la fiche investisseur
   - Génère un draft d'email récap (en attente de validation Guillaume)

### Pattern de fetch : Server Components > Server Actions > Client

```typescript
// ✅ PRÉFÉRÉ : Server Component pour les vues statiques
export default async function InvestorPage({ params }: { params: { id: string } }) {
  const investor = await getInvestorById(params.id); // direct DB query
  return <InvestorView investor={investor} />;
}

// ✅ PRÉFÉRÉ : Server Action pour les mutations
'use server';
async function updateInvestorNote(investorId: string, note: string) {
  const user = await getAuthenticatedUser();
  await assertCanWriteInvestor(user, investorId); // RLS double-check côté code
  await db.investors.update({ where: { id: investorId }, data: { note } });
  await logAudit({ user_id: user.id, action: 'investor.note.update', resource_id: investorId });
  revalidatePath(`/closing/investor/${investorId}`);
}

// ⚠ Réservé aux interactions très dynamiques (realtime, etc.)
function ClientComponent() {
  const { data } = useQuery({ queryKey: ['something-fast-moving'], queryFn: fetcher });
  // ...
}
```

### Pattern d'agent IA (function calling)

Voir [Section 18 - Patterns critiques](#18-patterns-critiques-avec-exemples-de-code) pour le code complet.

---

## 10. Data model complet

> Toutes les tables sont en PostgreSQL avec RLS activée. Conventions : `snake_case` pour les colonnes, IDs en UUID v4 sauf indication contraire, timestamps en `timestamptz`, soft-delete via `deleted_at`.

### Table `users`
Représente les utilisateurs internes (Killian, Guillaume, Stéphane, etc.). Authentification via Supabase Auth.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid (PK) | linked to auth.users |
| email | text (unique) | |
| full_name | text | |
| role | enum: `admin`, `closer`, `closer_junior`, `executive` | |
| avatar_url | text | nullable |
| phone | text | nullable, format E.164 |
| active | boolean | default true |
| created_at | timestamptz | default now() |
| last_seen_at | timestamptz | nullable |
| settings | jsonb | preferences personnelles |

### Table `investors`
Les inscrits SAH. **READ-ONLY mirror** depuis l'app SAH principale. Synchronisée via webhooks + polling de sécurité quotidien.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| sah_id | text (unique, indexed) | ID dans l'app SAH source |
| email | text | |
| full_name | text | |
| first_name | text | |
| last_name | text | |
| phone | text | nullable |
| date_of_birth | date | nullable, masqué pour closers |
| address_city | text | |
| address_postal_code | text | |
| profile_segment | enum: `junior`, `confirmed`, `csp_plus`, `executive` | calculé depuis KYC |
| total_invested | numeric(12,2) | cumul historique |
| projects_count | integer | nombre de projets souscrits |
| first_subscription_at | timestamptz | nullable |
| last_subscription_at | timestamptz | nullable |
| kyc_status | enum: `pending`, `validated`, `rejected`, `expired` | |
| acquisition_source | enum: `meta_ads`, `google_ads`, `linkedin_ads`, `seo`, `social_organic`, `referral`, `other` | |
| acquisition_campaign_id | text | nullable, ID externe |
| score | integer | 0-100, calculé par l'IA |
| score_updated_at | timestamptz | |
| score_reasoning | text | explication de l'IA |
| assigned_closer_id | uuid | FK users, nullable |
| pipeline_stage | enum: `new`, `contacted`, `meeting_booked`, `meeting_done`, `proposal_sent`, `closed_won`, `closed_lost`, `dormant` | |
| pipeline_stage_updated_at | timestamptz | |
| communication_consent | boolean | RGPD, opt-in explicite |
| last_email_opened_at | timestamptz | nullable |
| last_page_visit_at | timestamptz | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| deleted_at | timestamptz | nullable, soft-delete |

**Indexes** : `(assigned_closer_id, pipeline_stage)`, `(score desc)`, `(sah_id)`, `(email)`.

**RLS** :
- `admin` : SELECT all
- `closer` : SELECT WHERE `assigned_closer_id = auth.uid()`
- `closer_junior` : SELECT WHERE `assigned_closer_id = auth.uid() AND score < 75`
- `executive` : SELECT all mais avec colonnes sensibles masquées (date_of_birth, address)

### Table `projects`
Les projets immobiliers SAH. **READ-ONLY mirror** depuis l'app SAH.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| sah_id | text (unique) | |
| name | text | ex: "Brézins", "Capsule" |
| status | enum: `draft`, `open`, `funding`, `funded`, `in_operation`, `repaying`, `completed`, `cancelled` | |
| target_amount | numeric(12,2) | montant à lever |
| collected_amount | numeric(12,2) | levé à date |
| target_yield_annual | numeric(5,2) | en % (ex: 15.00) |
| duration_months | integer | |
| opened_at | timestamptz | date d'ouverture aux souscriptions |
| expected_completion_at | timestamptz | |
| location_city | text | |
| location_region | text | |
| project_type | enum: `marchand_de_biens`, `promotion`, `renovation`, `autre` | |
| description_short | text | |
| description_long | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### Table `subscriptions`
Les souscriptions des investisseurs aux projets.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| sah_id | text (unique) | |
| investor_id | uuid (FK) | |
| project_id | uuid (FK) | |
| amount | numeric(10,2) | en € |
| signed_at | timestamptz | date de signature contrat |
| paid_at | timestamptz | date de virement reçu |
| status | enum: `signed`, `paid`, `active`, `repaid`, `cancelled` | |
| expected_repayment_at | timestamptz | calculé : paid_at + duration_months |
| repaid_at | timestamptz | nullable |
| repaid_principal | numeric(10,2) | nullable |
| repaid_yield | numeric(10,2) | nullable |
| created_at | timestamptz | |

### Table `interactions`
Toute interaction trackée d'un investisseur (mail ouvert, page visitée, clic, appel, etc.). Source de la donnée comportementale pour le scoring IA.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| investor_id | uuid (FK) | |
| type | enum: `email_sent`, `email_opened`, `email_clicked`, `page_visit`, `simulator_used`, `dic_downloaded`, `call_outbound`, `call_inbound`, `whatsapp_sent`, `whatsapp_received`, `linkedin_dm`, `meeting_booked`, `meeting_done`, `proposal_sent`, `note_added` | |
| metadata | jsonb | détails type-specific |
| value_numeric | numeric(10,2) | montant si pertinent (ex: proposition envoyée à 8K€) |
| project_ref | uuid | FK projects, nullable |
| user_id | uuid | FK users, qui a déclenché (ou null si auto) |
| created_at | timestamptz | |

**Indexes** : `(investor_id, created_at desc)`, `(type, created_at)`.

### Table `calls`
Détail des appels téléphoniques (extension de `interactions` type call).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| interaction_id | uuid (FK) | |
| investor_id | uuid (FK) | |
| closer_id | uuid (FK users) | |
| direction | enum: `outbound`, `inbound` | |
| started_at | timestamptz | |
| ended_at | timestamptz | |
| duration_seconds | integer | computed |
| recording_url | text | Supabase Storage, nullable |
| consent_given | boolean | OBLIGATOIRE = true pour enregistrement |
| transcription | text | nullable, généré par Whisper |
| ai_summary | text | nullable, généré par Claude |
| ai_objections_raised | jsonb | array de strings |
| ai_interests_expressed | jsonb | array |
| ai_amount_mentioned | numeric(10,2) | nullable |
| ai_next_action | text | nullable |
| created_at | timestamptz | |

### Table `briefs`
Briefs d'appel générés par l'IA avant chaque RDV.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| investor_id | uuid (FK) | |
| generated_for | uuid (FK users) | closer destinataire |
| trigger | enum: `manual`, `auto_meeting_upcoming`, `auto_rebound_11m`, `auto_hot_lead` | |
| context_summary | text | profil + historique |
| suggested_script | text | script d'ouverture |
| key_points | jsonb | array of strings |
| objections_to_anticipate | jsonb | |
| matched_projects | jsonb | projets suggérés |
| generated_at | timestamptz | |
| consumed_at | timestamptz | nullable, quand le closer l'a lu |
| llm_provider | text | "anthropic-claude-opus-4-7" |
| tokens_used | integer | |
| cost_eur | numeric(6,4) | coût estimé |

### Table `scores_history`
Historique des changements de score pour audit et debug.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| investor_id | uuid (FK) | |
| score | integer | |
| previous_score | integer | nullable |
| reasoning | text | explication IA |
| trigger | enum: `event`, `daily_recompute`, `manual` | |
| trigger_event_id | uuid | FK interactions, nullable |
| computed_at | timestamptz | |
| llm_provider | text | |
| tokens_used | integer | |

### Table `email_flows`
Workflows d'automation email.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | text | |
| description | text | nullable |
| status | enum: `draft`, `active`, `paused`, `archived` | |
| trigger_type | enum: `event`, `schedule`, `manual` | |
| trigger_config | jsonb | config du trigger |
| conditions | jsonb | conditions multi-critères (arbre logique) |
| actions | jsonb | actions à exécuter (envoi mail, push CRM, etc.) |
| stats_sent | integer | counter, sent count |
| stats_opened | integer | |
| stats_clicked | integer | |
| stats_converted | integer | conversions attribuées |
| created_by | uuid (FK users) | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### Table `email_flow_runs`
Trace de chaque exécution d'un flow pour un investisseur.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| flow_id | uuid (FK email_flows) | |
| investor_id | uuid (FK) | |
| trigger_event_id | uuid | nullable, FK interactions |
| status | enum: `triggered`, `conditions_failed`, `pending_validation`, `validated`, `sent`, `bounced`, `converted` | |
| validated_by | uuid (FK users) | nullable |
| validated_at | timestamptz | nullable |
| email_content | text | contenu final envoyé |
| amf_compliance_passed | boolean | passé le scanner ? |
| brevo_message_id | text | nullable, ID du message dans Brevo |
| created_at | timestamptz | |

### Table `ad_accounts`, `ad_campaigns`, `ad_sets`, `ads`
Tables mirroring les structures Meta/Google/LinkedIn. Synchronisées via API toutes les 4h.

(Structure standard, voir doc Meta Marketing API. Pas développé ici pour brièveté, mais à modéliser fidèlement.)

### Table `attribution_touches`
Pour l'attribution multi-touch (V2).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| investor_id | uuid (FK) | |
| touchpoint_type | enum: `ad_click`, `email_open`, `email_click`, `page_visit`, `call`, `social_dm` | |
| touchpoint_ref | jsonb | references (campaign_id, email_id, page_url, etc.) |
| attribution_weight | numeric(5,4) | poids attribué par le modèle |
| converted_to_subscription_id | uuid | FK, nullable |
| timestamp | timestamptz | |

### Table `audit_log`
Tout, absolument tout, est loggé ici. Append-only.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK users) | nullable si action système |
| user_email | text | snapshot |
| user_role | text | snapshot |
| action | text | ex: `investor.view`, `investor.note.update`, `email.send`, `campaign.pause` |
| resource_type | text | ex: `investor`, `campaign`, `email_flow` |
| resource_id | uuid | |
| metadata | jsonb | détails action |
| ip_address | inet | |
| user_agent | text | |
| created_at | timestamptz | |

**Indexes** : `(user_id, created_at desc)`, `(resource_type, resource_id, created_at desc)`, `(action, created_at desc)`.

**RLS** : `admin` seulement en SELECT. INSERT autorisé pour tous les utilisateurs via fonction service-role.

### Table `llm_calls`
Log de tous les appels LLM pour audit, debug, et contrôle des coûts.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid | nullable si système |
| provider | text | "anthropic", "openai" |
| model | text | "claude-opus-4-7" |
| purpose | text | "scoring", "brief_generation", "email_personalization", etc. |
| prompt_tokens | integer | |
| completion_tokens | integer | |
| total_tokens | integer | |
| cost_eur | numeric(10,6) | |
| latency_ms | integer | |
| status | enum: `success`, `error`, `timeout` | |
| error_message | text | nullable |
| input_summary | text | (pas le prompt complet pour pas exploser la DB) |
| output_summary | text | |
| created_at | timestamptz | |

### Table `pilot_concierge_sessions` (V1.5)
Sessions WhatsApp de Pilot Concierge.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| whatsapp_phone | text | numéro de l'utilisateur (Stéphane) |
| user_id | uuid (FK users) | matching avec table users |
| started_at | timestamptz | |
| last_message_at | timestamptz | |
| auth_validated_at | timestamptz | dernière validation par code |
| messages_count | integer | |
| status | enum: `active`, `expired`, `revoked` | |

### Vue `investor_full_context`
Vue matérialisée pour servir le contexte complet d'un investisseur à l'IA (scoring, brief). Refresh toutes les heures.

```sql
CREATE MATERIALIZED VIEW investor_full_context AS
SELECT 
  i.*,
  -- Counts d'interactions sur 90 jours
  (SELECT count(*) FROM interactions WHERE investor_id = i.id AND type = 'email_opened' AND created_at > now() - interval '90 days') as emails_opened_90d,
  (SELECT count(*) FROM interactions WHERE investor_id = i.id AND type = 'page_visit' AND created_at > now() - interval '90 days') as pages_visited_90d,
  -- Dernière interaction
  (SELECT max(created_at) FROM interactions WHERE investor_id = i.id) as last_interaction_at,
  -- Souscriptions actives
  (SELECT count(*) FROM subscriptions WHERE investor_id = i.id AND status = 'active') as active_subscriptions,
  -- Prochaine échéance
  (SELECT min(expected_repayment_at) FROM subscriptions WHERE investor_id = i.id AND status = 'active') as next_repayment_at
FROM investors i
WHERE i.deleted_at IS NULL;

CREATE UNIQUE INDEX ON investor_full_context (id);
```

---

## 11. Intégrations externes

### Brevo (anciennement Sendinblue) — emails
- **API** : https://api.brevo.com/v3
- **Auth** : API key dans env `BREVO_API_KEY`
- **Use cases** :
  - Envoi des emails depuis nos flows custom (`POST /smtp/email`)
  - Création/update de contacts (`POST /contacts`)
  - Sync des opens/clicks via webhooks
- **Webhooks** : `https://the-pilot.sevenathome.io/api/webhooks/brevo`
- **Rate limit** : ~100 req/sec, mais conseillé de batcher

### Meta Marketing API — ads
- **API** : https://graph.facebook.com/v19.0
- **Auth** : OAuth 2.0 system user token, dans env `META_SYSTEM_USER_TOKEN`
- **Ad account ID SAH** : `1414494822918878`
- **Business ID SAH** : `839176021486079`
- **Note** : Le compte SAH n'est pas encore éligible au MCP Meta Ads (rollout en cours côté Meta). On utilise l'API REST classique.
- **Use cases** :
  - Sync des campagnes / ad sets / ads toutes les 4h
  - Récupération des insights (impressions, clicks, conversions)
  - Création de variants ad (V2)
  - Auto-pause sur seuils (V2)

### Google Ads API — ads
- **API** : v17
- **Auth** : OAuth 2.0 + developer token, dans env `GOOGLE_ADS_DEVELOPER_TOKEN`
- **Customer ID SAH** : à confirmer avec Killian
- **Use cases** : sync campagnes Search + Performance Max, insights

### LinkedIn Marketing API
- **Auth** : OAuth 2.0, scope `r_ads`, `r_ads_reporting`
- **V1** : lecture seule (read insights)
- **V2** : création/modification de campagnes

### Calendly API v2
- **Auth** : OAuth 2.0 ou Personal Access Token
- **Account** : `g-gosselin-sevenathome`
- **Use cases** :
  - Sync des RDV bookés (webhook `invitee.created`)
  - Récupération de l'URL d'un nouveau RDV pour la fiche investisseur
- **Webhooks** : `https://the-pilot.sevenathome.io/api/webhooks/calendly`

### Anthropic API (Claude)
- **API** : https://api.anthropic.com/v1/messages
- **Auth** : API key dans env `ANTHROPIC_API_KEY` (compte BREACH dédié au projet)
- **Modèles utilisés** :
  - `claude-opus-4-7` : génération brief d'appel, génération email personnalisé, analyse appel
  - `claude-haiku-4-5-20251001` : scoring investisseur, classification, AMF compliance check
- **Limites à enforcer** : budget mensuel max via env `ANTHROPIC_MAX_MONTHLY_EUR`
- **Function calling** : utilisé pour le chat with your data (accès lecture aux tables)

### OpenAI Whisper API
- **API** : https://api.openai.com/v1/audio/transcriptions
- **Auth** : API key dans env `OPENAI_API_KEY`
- **Use case** : transcription des appels (uniquement)
- **Coût** : $0.006/min audio

### WhatsApp Business API (Meta Cloud API) — Pilot Concierge V1.5
- **API** : https://graph.facebook.com/v19.0/{phone_number_id}/messages
- **Auth** : OAuth 2.0 system user, dans env `WHATSAPP_TOKEN`
- **Numéro dédié** : à provisionner (compte business verified)
- **Webhooks** : `https://the-pilot.sevenathome.io/api/whatsapp/webhook`
- **Coût** : 0.03 à 0.08€ par conversation initiée

### App SAH principale (source de vérité données investisseurs)
- **Base URL** : `https://app.sevenathome.com` (à confirmer)
- **Méthode d'accès** :
  - Option A (préférée) : webhooks SAH → THE PILOT sur événements (nouvel inscrit, KYC validé, souscription, etc.)
  - Option B : connection read-only Postgres replica si les devs SAH le permettent
  - Option C (fallback) : API REST avec auth Bearer token
- **Action à faire avant code** : RDV technique avec les devs SAH pour caler le mode d'intégration (cf. brief technique dans le doc projet)

---

## 12. Sécurité et conformité réglementaire

### Authentification
- **Provider** : Supabase Auth
- **Méthodes** : email + password ET/OU SSO Google/Microsoft
- **2FA** : OBLIGATOIRE pour rôles `admin` et `closer`. Recommandé pour `executive`. Implémenté via TOTP (Google Authenticator, Authy).
- **Session timeout** : 12h pour rôles standards, 4h pour `admin` (avec re-auth pour actions sensibles)
- **Couche supplémentaire** : Cloudflare Access en frontal (Zero Trust), bloque l'accès à TOUTE l'app sauf emails autorisés

### Autorisation
- **RLS Supabase** activée sur TOUTES les tables, sans exception
- **Double-check côté code** : chaque server action vérifie aussi les permissions (defense in depth)
- **Rôles** : `admin`, `closer`, `closer_junior`, `executive` (cf. section 3)
- **Pas de "super admin"** caché. Killian est `admin`, ses actions sont auditées comme celles des autres.

### Données sensibles
**Données KYC ultra-sensibles** (date de naissance complète, numéro pièce d'identité, RIB) :
- **Stockage** : champs chiffrés en colonne via `pgcrypto` (encrypt at column level)
- **Affichage** : masqué par défaut, déchiffré uniquement sur demande explicite + log
- **Prompts IA** : INTERDIT d'envoyer ces données à un LLM externe

**Données KYC moins sensibles** (tranche d'âge, segment CSP) :
- Stockage standard, accessible aux closers

### Chiffrement
- **At rest** : Supabase chiffre par défaut (AES-256)
- **In transit** : TLS 1.3 partout, HSTS forcé
- **Backups** : chiffrés (Supabase backup auto + backup additionnel S3 EU pour les données critiques)

### RGPD
**Article 22 (décisions automatisées)** :
- Aucune décision automatique significative sans human-in-the-loop
- Mention dans politique de confidentialité de l'usage du profilage
- Droit d'opposition implémenté (l'investisseur peut demander l'arrêt du profilage via SAH support)

**Article 17 (droit à l'oubli)** :
- Endpoint admin pour anonymiser un investisseur sur demande
- Anonymisation = remplacement des PII par des hashs irréversibles, conservation des interactions agrégées pour la statistique

**Article 30 (registre des traitements)** :
- Génération auto du registre via une route admin
- Mise à jour à chaque nouveau type de traitement

**Hébergement** : EU uniquement (Supabase Frankfurt + Vercel EU). Aucun transfert hors UE.

**Audit log RGPD** :
- Qui a accédé à quelles données KYC, quand, depuis quelle IP
- Exportable pour contrôle CNIL en CSV/PDF
- Conservation 5 ans

### AMF (Autorité des Marchés Financiers)
**Termes interdits scannés AVANT chaque envoi** :

```typescript
const AMF_FORBIDDEN_TERMS = [
  'garanti', 'garantie', 'garantir',
  'sans risque', 'risque zéro', 'aucun risque',
  'sûr', 'sécurisé' /* dans contexte rendement */,
  'certain', 'assuré' /* dans contexte rendement */,
  'crowdfunding', 'financement participatif',
];
```

**Mention obligatoire** quand un rendement est mentionné : "rendement cible, capital non garanti".

**Audit conformité** :
- Chaque envoi (email, ad, post) est scanné, le résultat est loggé
- Tableau de bord admin pour voir les rejets et les correctifs

### Pentest et audit sécu
- **Avant mise en prod V1** : pentest externe par un cabinet certifié (compter 2-5K€, prévoir 2 semaines)
- **Annuel ensuite** : audit sécu léger
- **Plan de réponse aux incidents** : documenté, drillé une fois avant la prod

### Backups et continuité
- **Backups** : Supabase point-in-time recovery (PITR) sur 30 jours
- **Rétention** : 30 jours hot + 1 an cold (S3 EU)
- **Test de restauration** : mensuel, automatisé
- **RTO** : 4h (Recovery Time Objective)
- **RPO** : 1h (Recovery Point Objective)

---

## 13. Conventions de code

### Langage
- **TypeScript strict mode obligatoire** (`"strict": true` dans tsconfig.json)
- Pas de `any`, jamais. Si vraiment besoin : `unknown` + narrowing.
- Pas de `// @ts-ignore`. Si vraiment besoin : `// @ts-expect-error` avec justification.

### Naming
- **Fichiers** : `kebab-case.ts` ou `kebab-case.tsx`
- **Composants React** : `PascalCase`
- **Hooks** : `camelCase` avec préfixe `use*`
- **Functions** : `camelCase`
- **Types/Interfaces** : `PascalCase`. Préférer `type` à `interface` sauf cas particuliers (extension).
- **Constants globales** : `SCREAMING_SNAKE_CASE`
- **DB columns** : `snake_case`
- **API routes** : `/api/[module]/[resource]/[action]` en `kebab-case`

### Organisation des imports

```typescript
// 1. React/Next/externals
import { useState } from 'react';
import { redirect } from 'next/navigation';

// 2. Internal utilities/libs
import { db } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

// 3. Components
import { Button } from '@/components/ui/button';
import { InvestorCard } from '@/components/closing/investor-card';

// 4. Types
import type { Investor } from '@/types/investor';

// 5. Styles (si applicable)
import styles from './styles.module.css';
```

### Pattern de Server Action (mutations)

```typescript
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';

const inputSchema = z.object({
  investorId: z.string().uuid(),
  note: z.string().min(1).max(2000),
});

export async function updateInvestorNote(input: z.infer<typeof inputSchema>) {
  // 1. Auth + validation input
  const user = await getAuthenticatedUser();
  const parsed = inputSchema.parse(input);
  
  // 2. Permissions (double-check au-delà de RLS)
  await requireRole(user, ['admin', 'closer']);
  if (user.role === 'closer') {
    const investor = await db.investors.findById(parsed.investorId);
    if (investor.assignedCloserId !== user.id) {
      throw new Error('FORBIDDEN: not your investor');
    }
  }
  
  // 3. Mutation
  await db.investors.update({
    where: { id: parsed.investorId },
    data: { internalNote: parsed.note, updatedAt: new Date() },
  });
  
  // 4. Audit
  await logAudit({
    userId: user.id,
    action: 'investor.note.update',
    resourceType: 'investor',
    resourceId: parsed.investorId,
  });
  
  // 5. Revalidate cache
  revalidatePath(`/closing/investor/${parsed.investorId}`);
  
  return { success: true };
}
```

### Pattern de Route Handler (API endpoints, surtout pour webhooks)

```typescript
// app/api/webhooks/brevo/route.ts
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyBrevoSignature } from '@/lib/brevo/webhook';
import { db } from '@/lib/db';

const eventSchema = z.object({
  event: z.enum(['opened', 'clicked', 'unsubscribed', 'bounced']),
  email: z.string().email(),
  messageId: z.string(),
  ts: z.number(),
});

export async function POST(req: NextRequest) {
  // 1. Verify signature
  const signature = req.headers.get('x-mailin-signature');
  const body = await req.text();
  if (!verifyBrevoSignature(body, signature)) {
    return new Response('Invalid signature', { status: 401 });
  }
  
  // 2. Parse + validate
  const parsed = eventSchema.parse(JSON.parse(body));
  
  // 3. Process
  const investor = await db.investors.findByEmail(parsed.email);
  if (investor) {
    await db.interactions.create({
      data: {
        investorId: investor.id,
        type: `email_${parsed.event}` as InteractionType,
        metadata: { messageId: parsed.messageId },
        createdAt: new Date(parsed.ts * 1000),
      },
    });
  }
  
  return Response.json({ ok: true });
}
```

### Gestion des erreurs
- **Pas de try/catch silencieux**. Soit on attrape et on log, soit on laisse remonter.
- **Erreurs métier** : classes custom (`AmfComplianceError`, `KycAccessError`) qui sont catchées au niveau supérieur
- **Toujours logger** les erreurs serveur dans Sentry
- **Toujours retourner** des messages génériques aux utilisateurs (pas de stack trace exposée)

### Tests
- **Framework** : Vitest
- **Coverage cible** : 70% sur la logique métier critique (scoring, AMF check, attribution)
- **Tests obligatoires sur** :
  - Tous les helpers de permissions
  - Le scanner AMF
  - Le calcul de score
  - Les server actions de mutation critiques
- **Pas obligatoire sur** : composants UI purs (sauf si logique complexe)

### Commits
- **Conventional Commits** : `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`
- **Branches** : `feat/[short-desc]`, `fix/[short-desc]`
- **PRs** : description en français, screenshot si UI, mention des risques sécu si applicable
- **Pas de force-push sur main**. Jamais.

---

## 14. Structure du repository

```
the-pilot/
├── .github/
│   └── workflows/
│       ├── ci.yml              # lint + typecheck + tests sur PR
│       └── deploy.yml          # auto-deploy via Vercel sur push main
├── docs/
│   ├── ARCHITECTURE.md         # ce fichier en version mise à jour
│   ├── DATA_MODEL.md           # extrait du data model + diagrammes
│   ├── INTEGRATIONS.md         # détails des intégrations
│   ├── SECURITY.md             # politique sécu + procédures
│   ├── AMF_COMPLIANCE.md       # liste des termes + procédures de review
│   └── ONBOARDING.md           # pour un nouveau dev
├── public/
│   └── (assets statiques)
├── src/
│   ├── app/
│   │   ├── (auth)/             # routes publiques (login, signup)
│   │   ├── (dashboard)/        # routes protégées (require auth)
│   │   │   ├── closing/
│   │   │   │   ├── pipeline/page.tsx
│   │   │   │   ├── investor/[id]/page.tsx
│   │   │   │   └── calls/page.tsx
│   │   │   ├── email/
│   │   │   │   ├── flows/page.tsx
│   │   │   │   ├── segments/page.tsx
│   │   │   │   └── templates/page.tsx
│   │   │   ├── social/
│   │   │   ├── ads/
│   │   │   ├── performance/
│   │   │   ├── settings/
│   │   │   └── layout.tsx      # layout dashboard (sidebar, topbar)
│   │   ├── api/
│   │   │   ├── webhooks/
│   │   │   │   ├── sah/route.ts
│   │   │   │   ├── brevo/route.ts
│   │   │   │   ├── calendly/route.ts
│   │   │   │   └── meta/route.ts
│   │   │   ├── whatsapp/
│   │   │   │   └── webhook/route.ts
│   │   │   ├── inngest/
│   │   │   │   └── route.ts    # Inngest endpoint
│   │   │   └── cron/
│   │   │       ├── sync-meta-ads/route.ts
│   │   │       └── recompute-scores/route.ts
│   │   ├── layout.tsx
│   │   └── page.tsx            # landing/login redirect
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── closing/            # composants module Closing
│   │   ├── email/              # composants module Email
│   │   ├── social/
│   │   ├── ads/
│   │   ├── performance/
│   │   ├── brain/              # chat IA, agent UI
│   │   └── shared/             # composants utilisés cross-module
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts        # client Supabase
│   │   │   └── queries/        # queries réutilisables
│   │   ├── auth/
│   │   │   ├── index.ts        # getAuthenticatedUser, requireRole
│   │   │   └── permissions.ts
│   │   ├── ai/
│   │   │   ├── anthropic.ts    # client Claude
│   │   │   ├── openai.ts       # client OpenAI (Whisper, embeddings)
│   │   │   ├── prompts/        # system prompts par use case
│   │   │   ├── tools/          # function calling tools
│   │   │   ├── scoring.ts      # logique scoring investisseur
│   │   │   ├── brief.ts        # logique génération brief
│   │   │   └── amf-compliance.ts # scanner AMF
│   │   ├── integrations/
│   │   │   ├── brevo/
│   │   │   ├── meta-ads/
│   │   │   ├── google-ads/
│   │   │   ├── calendly/
│   │   │   ├── whatsapp/
│   │   │   └── sah/            # connexion app SAH source
│   │   ├── audit.ts            # logger d'audit
│   │   ├── attribution.ts      # modèle d'attribution multi-touch (V2)
│   │   └── utils/              # helpers génériques
│   ├── inngest/                # définitions des background jobs
│   │   ├── functions/
│   │   │   ├── score-recompute.ts
│   │   │   ├── call-process.ts
│   │   │   ├── email-send.ts
│   │   │   └── rebound-11m.ts
│   │   └── client.ts
│   ├── types/                  # types partagés
│   │   ├── investor.ts
│   │   ├── project.ts
│   │   ├── subscription.ts
│   │   └── ...
│   └── proxy.ts                # auth check, rate limit, etc. (Next 16 — remplace middleware.ts)
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/                    # Playwright (V2)
├── prisma/                     # OU drizzle/ si on choisit Drizzle
│   ├── schema.prisma
│   └── migrations/
├── .env.example
├── .gitignore
├── biome.json                  # OU eslint.config.js + prettier
├── next.config.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── CLAUDE.md                   # instructions Claude Code (pointer vers ce fichier)
└── README.md
```

### Notes sur le choix ORM
- **Drizzle** recommandé pour ce projet : plus léger, plus rapide, mieux intégré avec Supabase
- Alternative : Prisma (plus mature, mais plus lourd, moins de support natif Supabase RLS)
- **Décision finale à confirmer en début de projet par Killian + son ami dev**

---

## 15. Workflow Git, CI/CD et déploiement

### Branches
- `main` : branche de production, protégée. PR requise pour merge.
- `develop` (optionnel) : branche d'intégration. Pour ce projet à 2 devs, peut être sauté.
- `feat/*`, `fix/*`, `chore/*` : branches de travail

### Workflow standard
1. Créer une issue Linear (avec critères d'acceptation clairs)
2. Créer une branche `feat/closing-pipeline-kanban` depuis main
3. Coder, commit régulièrement
4. Push, ouvrir PR avec description en français
5. CI run automatique (lint + typecheck + tests)
6. Review par l'autre dev (obligatoire)
7. Squash merge sur main
8. Vercel déploie automatiquement

### CI (GitHub Actions)
- **Sur push branche** : lint + typecheck + tests unitaires
- **Sur PR** : tout ce qui précède + tests d'intégration (avec DB de test)
- **Sur main** : tout + deploy preview Vercel (optionnel)

### CD (Vercel)
- **Branches** : preview deployments auto sur chaque PR
- **Main** : production deployment auto
- **Rollback** : 1 clic via interface Vercel sur le commit précédent

### Environments
- `production` : `https://the-pilot.sevenathome.io` (ou .com selon DNS)
- `staging` : `https://staging.the-pilot.sevenathome.io` (auto-deploy depuis develop)
- `preview` : URLs Vercel temporaires sur les PRs
- `local` : `localhost:3000` (dev)

### Database per env
- Production : projet Supabase dédié, région EU
- Staging : projet Supabase dédié, région EU, données anonymisées
- Local : Supabase local (via CLI Supabase) OU connexion à staging en read-only

### Secrets management
- **Local** : `.env.local` (gitignored)
- **CI/CD + Prod** : Vercel Env Variables + Doppler en frontal
- **Partage équipe** : 1Password Teams (jamais Slack/email)

---

## 16. Roadmap par versions

### V0 — Foundation (M0 à M1)
**Objectif** : poser les fondations techniques propres pour pouvoir construire vite ensuite.

- Setup repo (Next.js 16 + TypeScript + Tailwind + shadcn)
- Setup Supabase (projet, schemas initiaux, RLS sur tables clés)
- Auth fonctionnelle (login email + Google SSO + 2FA admin)
- Cloudflare Access en frontal
- Layouts dashboards par rôle (sidebar, topbar, routing protégé)
- Connection à l'app SAH (read-only, webhooks principaux)
- Pages "vide" par module mais navigables
- Audit log fonctionnel
- Déploiement Vercel staging + prod
- README + onboarding doc

### V1 — Closing First (M1 à M4)
**Objectif** : livrer le module qui a le plus d'impact business immédiat. Sortir avec quelque chose qui change vraiment la vie de Guillaume.

- **Module Closing Engine complet** :
  - Pipeline kanban
  - Fiche investisseur enrichie
  - Scoring IA fonctionnel
  - Brief d'appel auto-généré (LLM)
  - Trigger rebond 11 mois automatique
  - Multi-canal centralisé (notes manuelles)
- **Module Email Reactor V1** :
  - Builder de flows simple (3-4 conditions max)
  - Connexion Brevo bidirectionnelle
  - Détection des leads chauds → push CRM
  - Scanner AMF avant envoi
- **AMF compliance** : scanner intégré sur tous les contenus sortants
- **Dashboards** : par rôle, KPIs basiques
- **Pentest externe** : passé avant mise en prod
- **Documentation** : à jour pour Stéphane et Guillaume

### V1.5 — Pilot Concierge (M5 à M6)
**Objectif** : ajouter le "wow factor" pour Stéphane, qui scelle la valeur perçue.

- Agent WhatsApp pour Stéphane
- Numéro dédié, business verified
- Auth par code 4 chiffres toutes les 4h
- Read-only sur toutes les data
- 4 contextes principaux : collecte mois, top leads, état projets, KPIs ads
- Latence < 5s par réponse
- Logging exhaustif

### V2 — Scale (M6 à M10)
**Objectif** : amener les modules manquants pour vraiment activer le 360.

- **Module Ads Control** :
  - Vue consolidée Meta + Google + LinkedIn
  - Détection AMF sur les copies ads
  - Attribution multi-touch data-driven (modèle simplifié)
  - Recos IA basiques
- **Module Social Hub** :
  - Veille concurrentielle (scraping via n8n)
  - Calendrier de publication
  - Génération auto de posts
- **Module Performance Lab** :
  - LTV par canal
  - Cohortes
  - Forecasting
  - Reporting PDF auto mensuel
- **Coaching IA en temps réel** pour les closers
- **Mobile PWA** pour Guillaume
- **Chat with your data** dans toute l'app
- **Architecture multi-tenant** en backend (préparation revente)

### V3 — Productisation (M10 à M18)
**Objectif** : transformer THE PILOT en produit SaaS revendable.

- White-label complet
- Mobile native iOS/Android
- Marketplace de templates sectoriels
- Predictive churn investisseur avancé
- Compliance auditable end-to-end
- Onboarding self-service pour nouveaux clients
- Documentation API ouverte

---

## 17. System prompts des agents IA

### Prompt 1 : Scoring d'investisseur

```
Tu es l'analyste IA de THE PILOT, l'outil interne de Seven At Home (plateforme privée d'investissement immobilier en club deal).

Ton rôle : analyser le profil et le comportement d'un investisseur, et lui attribuer un score de propension à investir entre 0 et 100.

Échelle :
- 0-30 : froid (pas prêt à investir, peu d'engagement)
- 31-60 : tiède (intérêt général, pas de signal fort)
- 61-80 : chaud (signaux d'intention, mérite un appel sous 7j)
- 81-100 : très chaud (prêt à signer, à appeler dans les 48h)

Critères à pondérer :
1. Engagement digital récent (emails ouverts, pages visitées sur 30j)
2. Historique de souscriptions (montant, fréquence, projets)
3. Comportement KYC (terminé ou pas, depuis combien de temps)
4. Signaux d'achat (DIC téléchargé, simulateur utilisé)
5. Cohérence avec projets actifs (durée, montant, profil)
6. Récence d'interaction (dormant vs actif)

Réponds STRICTEMENT au format JSON suivant :
{
  "score": 0-100,
  "reasoning": "explication concise en français, max 200 caractères",
  "key_signals": ["signal 1", "signal 2", "signal 3"],
  "recommended_action": "appeler|relancer_email|attendre|réactiver",
  "matched_projects": ["nom_projet_1", "nom_projet_2"]
}

Tu ne dois JAMAIS :
- Mentionner de rendement garanti dans les recommandations
- Suggérer des actions qui forceraient un closer à mentir
- Faire des hypothèses sur la situation financière au-delà de ce qui est dans les données
```

### Prompt 2 : Génération de brief d'appel

```
Tu es l'assistant des closers de Seven At Home. Tu prépares un brief d'appel pour un closer (Guillaume principalement) qui va appeler un investisseur.

Tu reçois les données suivantes :
- Profil de l'investisseur (anonymisé partiellement)
- Historique de souscriptions
- Comportement digital récent (30 derniers jours)
- Projets actifs SAH
- Contexte de l'appel (rebond 11 mois, premier contact, relance, etc.)

Tu produis :
1. Un résumé contexte (3-4 lignes max)
2. Un script d'ouverture personnalisé (2 phrases)
3. 4-5 points clés à aborder
4. 2-3 objections à anticiper avec contre-arguments
5. Les 1-3 projets à proposer en priorité, avec justification

Règles strictes :
- Aucune mention de rendement "garanti", "sûr", "certain". Toujours "rendement cible".
- Pas de pression commerciale dans le script. SAH se positionne comme partenaire, pas vendeur.
- Si la situation déclarée du prospect ne matche pas avec ce qu'on lui propose, le dire honnêtement plutôt que de pousser.
- Ton : professionnel, chaleureux, jamais condescendant.

Format de sortie : Markdown structuré, prêt à être lu en 30 secondes.
```

### Prompt 3 : Génération d'email personnalisé

```
Tu es l'assistant rédacteur de Seven At Home pour les emails à destination des investisseurs.

Tu reçois :
- Le template de base (objet + corps avec variables)
- Le profil de l'investisseur destinataire
- Le contexte d'envoi (trigger, projet associé, objectif)

Tu produis :
1. Un sujet d'email personnalisé (max 60 caractères, accroche claire)
2. Un corps d'email en HTML simple (compatible Brevo, max 200 mots)
3. Un CTA principal clair

Règles strictes :
- ZÉRO terme interdit AMF : "garanti", "sans risque", "sûr", "certain", "crowdfunding", "financement participatif"
- TOUJOURS mentionner "rendement cible, capital non garanti" quand un % de rendement est cité
- Mention {{unsubscribe}} en footer (Brevo l'injecte)
- Signature personnalisée Stéphane ou Guillaume selon contexte
- Ton : direct, humain, pas marketing-cliché. Pas de superlatifs ("incroyable", "exceptionnel").
- Tutoiement si l'investisseur a déjà tutoyé dans l'historique, vouvoiement sinon.

Format de sortie : JSON
{
  "subject": "...",
  "html_body": "...",
  "cta_label": "...",
  "cta_url": "...",
  "personalization_applied": ["liste des éléments adaptés"]
}
```

### Prompt 4 : Analyse post-appel

```
Tu analyses la transcription d'un appel téléphonique entre un closer de Seven At Home et un investisseur.

Tu extrais :
1. Les objections soulevées par l'investisseur (liste courte)
2. Les intérêts exprimés (projets, durées, montants)
3. Le montant d'investissement évoqué (si mentionné)
4. La prochaine action attendue (qui fait quoi, quand)
5. Un score de probabilité de closing (0-100)
6. Un résumé en 3 phrases max pour la fiche investisseur

Règles :
- Pas d'interprétation au-delà de ce qui est dit. Si l'investisseur est ambigu, dis-le.
- Pas de jugement sur le closer (l'app n'est pas un outil de surveillance)
- Si l'appel mentionne des termes AMF problématiques par le closer, le flagger spécifiquement.

Format JSON :
{
  "objections": ["..."],
  "interests": ["..."],
  "amount_mentioned_eur": 5000 | null,
  "next_action": "...",
  "closing_probability": 0-100,
  "summary": "...",
  "amf_issues_flagged": ["..."] | []
}
```

### Prompt 5 : AMF Compliance Check

```
Tu es le contrôleur de conformité AMF de Seven At Home. Tu reçois un contenu écrit destiné à un public (email, ad copy, post social, message commercial).

Tu cherches strictement :
- Les termes interdits : "garanti", "sans risque", "risque zéro", "sûr" (dans contexte rendement), "certain" (idem), "crowdfunding", "financement participatif"
- L'absence de mention "capital non garanti" ou équivalent quand un rendement est cité
- Les promesses excessives (formulations qui suggèrent une certitude de rendement)

Tu réponds JSON :
{
  "compliant": true | false,
  "issues": [
    {
      "term_or_phrase": "...",
      "location": "extrait du texte avec contexte",
      "severity": "critical" | "warning",
      "suggested_fix": "..."
    }
  ],
  "summary": "..."
}

Critères de sévérité :
- critical : terme interdit explicite, blocage obligatoire
- warning : formulation limite, à reformuler par précaution

Pas de jugement subjectif. Tu appliques les règles, point.
```

### Prompt 6 : Chat with your data (V2 mais utilisé dès V1 pour les recos in-app)

```
Tu es Pilot, l'assistant data de Seven At Home. Tu réponds aux questions des utilisateurs internes sur les données de l'app.

Tu as accès aux tools suivants (function calling) :
- query_investors(filters) : recherche investisseurs avec filtres
- get_investor_details(id) : détails d'un investisseur
- query_subscriptions(filters)
- get_collection_summary(period) : résumé collecte par période
- get_pipeline_status(closer_id?)
- get_ads_kpis(period, channel?)
[...]

Règles ABSOLUES :
1. Tu ne réponds JAMAIS sur des chiffres sans avoir d'abord appelé un tool. Si tu n'as pas le tool, dis "Je n'ai pas l'info via mes outils actuels, va voir dans le dashboard X".
2. Tu masques les noms complets sauf si l'utilisateur le demande explicitement (autorisations vérifiées en amont par le code).
3. Tu ne révèles JAMAIS de données KYC sensibles (date de naissance complète, RIB, pièce ID).
4. Ton ton : direct, factuel, concis. Pas de chichi marketing.
5. Si la question est ambiguë, demande une précision plutôt que d'inventer.
6. Si une demande contredit la conformité (AMF, RGPD), tu refuses et expliques pourquoi.

Format de réponse : prose courte, chiffres en gras, jamais de json brut côté utilisateur.
```

---

## 18. Patterns critiques avec exemples de code

### Pattern : Scanner AMF compliance

```typescript
// src/lib/ai/amf-compliance.ts

const AMF_CRITICAL_TERMS = [
  'garanti', 'garantie', 'garantir', 'garantis',
  'sans risque', 'risque zéro', 'aucun risque',
  'sûr', 'certain', 'assuré',
  'crowdfunding', 'financement participatif',
];

const AMF_REQUIRES_DISCLAIMER = [
  /\d+\s*%\s*(par an|annuel|de rendement)/i,
  /rendement[\s\w]*\d+/i,
];

const REQUIRED_DISCLAIMER_PATTERNS = [
  /capital\s+non\s+garanti/i,
  /rendement\s+cible/i,
];

export type AmfScanResult = {
  compliant: boolean;
  issues: AmfIssue[];
};

export type AmfIssue = {
  type: 'forbidden_term' | 'missing_disclaimer' | 'suspicious_phrasing';
  match: string;
  context: string;
  severity: 'critical' | 'warning';
  suggestedFix?: string;
};

export function scanAmfCompliance(text: string): AmfScanResult {
  const issues: AmfIssue[] = [];
  const lowerText = text.toLowerCase();
  
  // 1. Termes interdits
  for (const term of AMF_CRITICAL_TERMS) {
    const idx = lowerText.indexOf(term);
    if (idx !== -1) {
      const context = text.substring(Math.max(0, idx - 30), Math.min(text.length, idx + term.length + 30));
      issues.push({
        type: 'forbidden_term',
        match: term,
        context: `...${context}...`,
        severity: 'critical',
        suggestedFix: getAmfSuggestion(term),
      });
    }
  }
  
  // 2. Si rendement mentionné, vérifier disclaimer
  const mentionsYield = AMF_REQUIRES_DISCLAIMER.some((re) => re.test(text));
  if (mentionsYield) {
    const hasDisclaimer = REQUIRED_DISCLAIMER_PATTERNS.some((re) => re.test(text));
    if (!hasDisclaimer) {
      issues.push({
        type: 'missing_disclaimer',
        match: 'rendement mentionné sans disclaimer',
        context: text.substring(0, 200) + '...',
        severity: 'critical',
        suggestedFix: 'Ajouter "rendement cible, capital non garanti" à proximité de la mention de rendement.',
      });
    }
  }
  
  return {
    compliant: issues.filter((i) => i.severity === 'critical').length === 0,
    issues,
  };
}

function getAmfSuggestion(term: string): string {
  const map: Record<string, string> = {
    'garanti': 'remplacer par "cible" ou supprimer',
    'sans risque': 'remplacer par "avec un risque maîtrisé" et préciser le risque',
    'crowdfunding': 'remplacer par "club deal" ou "investissement immobilier privé"',
    'financement participatif': 'remplacer par "club deal"',
  };
  return map[term] ?? 'reformuler pour conformité AMF';
}
```

### Pattern : Server Action de mutation avec audit

Voir [Section 13 - Conventions de code](#13-conventions-de-code) pour le template complet.

### Pattern : Appel Anthropic avec function calling

```typescript
// src/lib/ai/anthropic.ts

import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import { logLlmCall } from '@/lib/ai/logging';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: object;
  handler: (input: any) => Promise<any>;
};

export async function callAgentWithTools({
  systemPrompt,
  userMessage,
  tools,
  userId,
  purpose,
  model = 'claude-opus-4-7',
  maxIterations = 5,
}: {
  systemPrompt: string;
  userMessage: string;
  tools: ToolDefinition[];
  userId: string;
  purpose: string;
  model?: string;
  maxIterations?: number;
}) {
  const startTime = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];
  
  const toolsForAnthropic = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as any,
  }));
  
  let finalResponse: string | null = null;
  
  for (let i = 0; i < maxIterations; i++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: toolsForAnthropic,
      messages,
    });
    
    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
    
    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((b) => b.type === 'text');
      finalResponse = textBlock?.type === 'text' ? textBlock.text : '';
      break;
    }
    
    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      
      const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          if (block.type !== 'tool_use') return null;
          const tool = tools.find((t) => t.name === block.name);
          if (!tool) {
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: `Error: tool ${block.name} not found`,
              is_error: true,
            };
          }
          try {
            const result = await tool.handler(block.input);
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: JSON.stringify(result),
            };
          } catch (err) {
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: `Error: ${(err as Error).message}`,
              is_error: true,
            };
          }
        })
      );
      
      messages.push({
        role: 'user',
        content: toolResults.filter(Boolean) as any,
      });
    }
  }
  
  const latencyMs = Date.now() - startTime;
  const costEur = estimateCost(model, totalInputTokens, totalOutputTokens);
  
  await logLlmCall({
    userId,
    provider: 'anthropic',
    model,
    purpose,
    promptTokens: totalInputTokens,
    completionTokens: totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    costEur,
    latencyMs,
    status: finalResponse ? 'success' : 'error',
  });
  
  return { response: finalResponse, costEur, latencyMs };
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-opus-4-7': { input: 15 / 1_000_000, output: 75 / 1_000_000 }, // $ per token
    'claude-haiku-4-5-20251001': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
  };
  const p = pricing[model];
  if (!p) return 0;
  const costUsd = inputTokens * p.input + outputTokens * p.output;
  return costUsd * 0.92; // approximation USD → EUR
}
```

### Pattern : Tools pour Chat with your data (function calling)

```typescript
// src/lib/ai/tools/data-tools.ts

import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export const dataTools = [
  {
    name: 'get_collection_summary',
    description: 'Récupère un résumé de la collecte SAH sur une période donnée (mois en cours, mois passé, année).',
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['current_month', 'last_month', 'last_30_days', 'year_to_date'],
          description: 'Période à analyser',
        },
      },
      required: ['period'],
    },
    handler: async (input: { period: string }) => {
      const startDate = computePeriodStart(input.period);
      const endDate = new Date();
      
      const result = await db.subscriptions.aggregate({
        where: {
          paidAt: { gte: startDate, lte: endDate },
          status: { in: ['paid', 'active'] },
        },
        _sum: { amount: true },
        _count: true,
      });
      
      return {
        period: input.period,
        from: startDate.toISOString(),
        to: endDate.toISOString(),
        total_amount_eur: result._sum.amount ?? 0,
        subscriptions_count: result._count,
        average_ticket_eur: result._count > 0 ? (result._sum.amount ?? 0) / result._count : 0,
      };
    },
  },
  
  {
    name: 'get_top_leads_for_closer',
    description: 'Récupère les top leads (investisseurs avec le score IA le plus haut) à appeler en priorité pour un closer.',
    input_schema: {
      type: 'object',
      properties: {
        closer_id: { type: 'string', description: 'UUID du closer. Si omis, retourne globalement.' },
        limit: { type: 'integer', default: 5 },
      },
    },
    handler: async (input: { closer_id?: string; limit?: number }) => {
      const limit = input.limit ?? 5;
      const investors = await db.investors.findMany({
        where: {
          assignedCloserId: input.closer_id ?? undefined,
          pipelineStage: { in: ['new', 'contacted', 'meeting_booked'] },
          deletedAt: null,
        },
        orderBy: { score: 'desc' },
        take: limit,
        select: {
          id: true,
          firstName: true,
          score: true,
          scoreReasoning: true,
          pipelineStage: true,
          totalInvested: true,
        },
      });
      return { count: investors.length, investors };
    },
  },
  
  // ... autres tools
];

function computePeriodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case 'current_month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'last_month':
      return new Date(now.getFullYear(), now.getMonth() - 1, 1);
    case 'last_30_days':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'year_to_date':
      return new Date(now.getFullYear(), 0, 1);
    default:
      throw new Error(`Unknown period: ${period}`);
  }
}
```

### Pattern : Webhook handler typé

Voir [Section 13 - Conventions de code](#13-conventions-de-code) pour le template.

### Pattern : Inngest function (background job)

```typescript
// src/inngest/functions/score-recompute.ts

import { inngest } from '../client';
import { db } from '@/lib/db';
import { computeInvestorScore } from '@/lib/ai/scoring';

export const recomputeScoreOnEvent = inngest.createFunction(
  {
    id: 'recompute-investor-score-on-event',
    concurrency: { limit: 10 },
    retries: 3,
  },
  { event: 'investor.interaction.created' },
  async ({ event, step }) => {
    const { investorId, interactionType } = event.data;
    
    // Ne recalculer que sur événements significatifs
    const significantEvents = ['email_opened', 'email_clicked', 'page_visit', 'simulator_used', 'dic_downloaded', 'meeting_booked', 'call_inbound'];
    if (!significantEvents.includes(interactionType)) return;
    
    const investor = await step.run('fetch-investor', async () => {
      return await db.investors.findUnique({
        where: { id: investorId },
        include: { interactions: { take: 50, orderBy: { createdAt: 'desc' } } },
      });
    });
    
    if (!investor) return;
    
    const newScore = await step.run('compute-score', async () => {
      return await computeInvestorScore(investor);
    });
    
    await step.run('save-score', async () => {
      await db.investors.update({
        where: { id: investorId },
        data: {
          score: newScore.score,
          scoreReasoning: newScore.reasoning,
          scoreUpdatedAt: new Date(),
        },
      });
      await db.scoresHistory.create({
        data: {
          investorId,
          score: newScore.score,
          previousScore: investor.score,
          reasoning: newScore.reasoning,
          trigger: 'event',
          triggerEventId: event.data.interactionId,
          llmProvider: 'anthropic-claude-haiku-4-5',
          tokensUsed: newScore.tokensUsed,
        },
      });
    });
    
    // Si score dépasse seuil chaud, déclencher push vers closer
    if (newScore.score >= 80 && (investor.score ?? 0) < 80) {
      await step.sendEvent('lead-became-hot', {
        name: 'investor.became_hot',
        data: { investorId, newScore: newScore.score },
      });
    }
  }
);
```

### Pattern : Trigger rebond 11 mois (cron daily)

```typescript
// src/inngest/functions/rebound-11m.ts

import { inngest } from '../client';
import { db } from '@/lib/db';
import { generateBrief } from '@/lib/ai/brief';

export const detectRebound11Months = inngest.createFunction(
  { id: 'detect-rebound-11-months' },
  { cron: 'TZ=Europe/Paris 0 9 * * *' }, // 9h chaque jour
  async ({ step }) => {
    // 1. Trouver les souscriptions actives qui finissent dans 15-30 jours
    const upcoming = await step.run('find-upcoming-repayments', async () => {
      const in15Days = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      
      return await db.subscriptions.findMany({
        where: {
          status: 'active',
          expectedRepaymentAt: { gte: in15Days, lte: in30Days },
        },
        include: { investor: true },
      });
    });
    
    // 2. Pour chacune, générer un brief si pas déjà fait dans les 14 derniers jours
    for (const sub of upcoming) {
      await step.run(`process-${sub.id}`, async () => {
        const recentBrief = await db.briefs.findFirst({
          where: {
            investorId: sub.investorId,
            trigger: 'auto_rebound_11m',
            generatedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
          },
        });
        if (recentBrief) return; // Déjà briefé récemment, skip
        
        const brief = await generateBrief({
          investor: sub.investor,
          trigger: 'auto_rebound_11m',
          context: { closingProject: sub.projectId, expectedAmount: sub.amount },
        });
        
        await db.briefs.create({
          data: {
            investorId: sub.investorId,
            generatedFor: sub.investor.assignedCloserId ?? getDefaultCloserId(),
            trigger: 'auto_rebound_11m',
            contextSummary: brief.context,
            suggestedScript: brief.script,
            keyPoints: brief.keyPoints,
            objectionsToAnticipate: brief.objections,
            matchedProjects: brief.matchedProjects,
            llmProvider: 'anthropic-claude-opus-4-7',
            tokensUsed: brief.tokensUsed,
            costEur: brief.costEur,
          },
        });
        
        // Push notification au closer
        await step.sendEvent('notify-closer-rebound', {
          name: 'closer.notification.send',
          data: {
            closerId: sub.investor.assignedCloserId,
            type: 'rebound_brief_ready',
            investorId: sub.investorId,
          },
        });
      });
    }
  }
);
```

---

## 19. Glossaire métier

| Terme | Définition |
|---|---|
| **AMF** | Autorité des Marchés Financiers, régulateur français |
| **ACPR** | Autorité de Contrôle Prudentiel et de Résolution, en charge du KYC |
| **CGP** | Conseiller en Gestion de Patrimoine (statut de Guillaume) |
| **Club deal immobilier** | Investissement collectif privé sur un projet immobilier, opéré par un sponsor (Stéphane) |
| **Closer** | Membre de l'équipe qui appelle les prospects et conclut les souscriptions |
| **CPA blended** | Coût par acquisition tous canaux confondus |
| **DIC** | Document d'Information Clé, obligatoire par projet |
| **DIS** | Document d'Information Synthétique, framework AMF |
| **Funnel A** | Funnel pour les épargnants, tickets 100€-4000€, objectif inscription |
| **Funnel B** | Funnel pour les investisseurs, tickets 5K€+, objectif RDV Calendly |
| **KYC** | Know Your Customer, vérification d'identité et de capacité financière |
| **LTV** | Lifetime Value, valeur cumulée d'un investisseur sur sa durée de relation |
| **Marchand de biens** | Statut commercial de Stéphane, opère les projets immobiliers |
| **PSFP** | Prestataire de Services de Financement Participatif (agrément réservé) |
| **Rebond 11 mois** | Cycle où un investisseur termine son projet et est rappelé pour réinvestir |
| **Rendement cible** | Formulation obligatoire AMF (jamais "garanti") |
| **RGPD** | Règlement Général sur la Protection des Données (EU) |
| **RLS** | Row Level Security (Postgres/Supabase) |
| **ROAS** | Return On Ad Spend |
| **SAH** | Seven At Home, le client |
| **Scoring IA** | Score 0-100 de propension à investir, calculé par THE PILOT |

---

## 20. Risques connus et mitigations

### Risque 1 : Fuite de données KYC investisseurs
**Impact** : catastrophique (sanction CNIL, perte de confiance investisseurs, contrôle AMF)
**Mitigations** :
- RLS Supabase activée partout, double-check côté code
- Chiffrement at-column des champs ultra-sensibles
- Cloudflare Access en frontal
- 2FA obligatoire admin/closer
- Pentest externe avant prod, annuel ensuite
- Pas de données KYC dans les prompts LLM
- Audit log RGPD exportable

### Risque 2 : Hallucination IA sur des chiffres financiers
**Impact** : décision business prise sur du faux
**Mitigations** :
- Tout chiffre passe par un tool (function calling)
- Le LLM cite explicitement la source du chiffre
- Validation humaine sur tout contenu sortant
- Logging exhaustif des appels LLM

### Risque 3 : Non-conformité AMF sur un contenu envoyé
**Impact** : contrôle AMF, sanction, atteinte à la réputation SAH
**Mitigations** :
- Scanner AMF automatique sur tout envoi
- Liste de termes interdits versionnée et review légalement
- Validation humaine obligatoire avant envoi
- Audit log des envois et des décisions de validation

### Risque 4 : Killian devient indisponible (vacances, burn, autre)
**Impact** : projet bloqué, SAH sans support, perte de confiance
**Mitigations** :
- Documentation à jour (ce fichier + ARCHITECTURE.md + INTEGRATIONS.md)
- L'ami dev en backup avec accès complet
- Toutes les ops automatisées (pas de scripts manuels critiques)
- Monitoring automatique avec alertes
- Plan de continuité documenté

### Risque 5 : L'API SAH change sans préavis
**Impact** : THE PILOT se désynchronise, données obsolètes
**Mitigations** :
- Accord avec les devs SAH sur préavis 2 semaines minimum
- Tests d'intégration quotidiens
- Alertes Sentry sur erreurs d'intégration
- Mode dégradé : si SAH indispo, l'app continue avec les données en cache

### Risque 6 : Surconsommation de tokens IA
**Impact** : facture API qui explose
**Mitigations** :
- Budget mensuel max configuré en env var
- Soft-block utilisateur au-delà
- Modèles différenciés (Haiku pour le scoring, Opus pour le complexe)
- Cache intelligent (ne pas regénérer un brief si déjà fait dans les 7 jours)
- Monitoring quotidien du coût

### Risque 7 : Bug en prod sur les permissions
**Impact** : un closer voit les leads d'un autre, ou un executive voit des KYC qu'il ne devrait pas
**Mitigations** :
- RLS Supabase = première ligne
- Double-check côté code en server actions
- Tests unitaires obligatoires sur les permissions
- Tests d'intégration avec différents rôles
- Audit log analysé régulièrement pour détecter les accès anormaux

### Risque 8 : Stéphane perd son téléphone (Pilot Concierge)
**Impact** : accès aux data SAH par un tiers
**Mitigations** :
- Auth par code 4 chiffres toutes les 4h
- Bouton "désactiver Pilot Concierge" depuis l'app
- Log des accès, alerte sur géoloc inhabituelle
- Pas de données KYC sensibles exposées même à Stéphane via WhatsApp

---

## 21. Comment Claude Code doit travailler sur ce projet

### Avant chaque session
1. **Lire ce document** en intégralité (ou la section pertinente)
2. **Vérifier le statut du repo** : `git status`, `git log -5`
3. **Vérifier les tests** : `pnpm test --run`
4. **Vérifier le build** : `pnpm typecheck`

### Pendant le développement
1. **Suivre les conventions de code** (section 13) sans exception
2. **Toujours typer fort** : pas de `any`
3. **Toujours valider les inputs** avec Zod
4. **Toujours vérifier les permissions** côté code en plus du RLS
5. **Toujours logger** les actions sensibles (audit log)
6. **Toujours scanner AMF** avant tout envoi externe
7. **Toujours écrire** au moins un test unitaire pour la nouvelle logique métier
8. **Toujours documenter** les décisions d'archi non-triviales dans `docs/`

### Code que Claude Code ne doit JAMAIS écrire sans demander explicitement à Killian
- Modification du schéma RLS Supabase
- Modification du système d'auth
- Bypass d'une vérification de permission
- Désactivation d'un test
- Ajout d'une nouvelle dépendance lourde (>100KB)
- Envoi de données vers un service hors EU
- Stockage de KYC en clair
- Hardcode de credentials, même en dev
- `// @ts-ignore`
- `eslint-disable` sans justification commentée
- `console.log` qui restera en prod (utiliser le logger structuré)

### Quand Claude Code doit s'arrêter et poser une question
- Ambiguïté sur les permissions d'un rôle
- Décision impliquant la conformité AMF/RGPD
- Performance critique (un endpoint qui pourrait tourner > 1s)
- Coût IA significatif (chaîne d'agents, embeddings massifs)
- Choix d'architecture non prévu dans ce document
- Conflit entre une demande de Killian et ce document (Killian a raison, mais on signale)

### Patterns Claude Code doit privilégier
- Server Components > Client Components (sauf besoin d'interactivité)
- Server Actions > API Routes pour les mutations internes
- Inngest > setInterval/setTimeout pour les jobs
- Drizzle/Supabase typed client > SQL brut quand possible
- Composants shadcn/ui > composants custom (sauf si vraiment besoin)
- Tailwind utilities > CSS custom
- Zod > validation manuelle

### Workflow Claude Code recommandé pour une nouvelle feature
1. Lire le ticket Linear ou la demande de Killian
2. Identifier les modules/tables impactés
3. Lire les sections pertinentes de ce document
4. Proposer un plan en 3-5 étapes à Killian avant de coder
5. Coder étape par étape, commit à chaque étape
6. Écrire les tests à mesure
7. Faire tourner les tests + le typecheck
8. Ouvrir une PR avec description en français
9. Attendre la review

### Communication avec Killian
- **Toujours en français**
- **Direct, pas de flatterie**
- **Si désaccord** : exposer son point, ne pas céder facilement
- **Si bloqué** : poser la question, ne pas inventer
- **Si urgence** : flagger immédiatement, ne pas attendre la fin de session

---

> **Note finale** : ce document évoluera. À chaque décision d'archi significative, mettre à jour la section concernée. Versionner via Git. Ne pas considérer comme figé.

> **Owner doc** : Killian — **Dernière mise à jour** : mai 2026 — **Version** : 1.0

