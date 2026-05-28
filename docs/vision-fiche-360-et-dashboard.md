# Vision produit — Fiche client 360 + Tableau de bord global

> Validé par Killian le 2026-05-28. Les deux faces de THE PILOT.
> Objectif ultime : tracker la rentabilité de chaque action Seven At Home.

---

## Principe directeur

THE PILOT a deux faces complémentaires :

- **La fiche client 360** = le détail granulaire d'UN investisseur (le microscope).
- **Le tableau de bord global** = l'agrégation de TOUT Seven (la vue satellite).

Le tableau de bord global est la somme de toutes les fiches. La donnée brute vit dans les fiches ; le dashboard l'agrège.

**Tout repose sur le tracking timeline + attribution** (cf. [attribution](#lien-attribution)).

---

## 1. La fiche client 360

Tout ce qu'on sait d'un investisseur, au même endroit. Page : `/closing/investor/[id]`.

### Blocs de la fiche

| Bloc | Contenu | Source |
|---|---|---|
| Identité | Nom, prénom, email, téléphone, date de naissance, ville, code postal | SAH (mirror) |
| Statut SAH | `registration_complete`, `onboarding_complete` | SAH (mirror) |
| Profil business | Segment, total investi, nb de projets, source d'acquisition, campagne | SAH + calcul interne |
| Score IA | Score 0-100, reasoning, recommandation d'action, signaux clés | THE PILOT (Claude) |
| Timeline complète | Chaque action sortante (appel, SMS, WhatsApp, email, relance) + chaque réaction (ouverture, clic, simulation, DIC, investissement), horodaté | THE PILOT + intégrations |
| Souscriptions | Projet, montant, date signature, date virement, statut, date remboursement prévue | SAH (mirror) |
| Attribution | Quelle(s) action(s) ont précédé/mené à chaque investissement | THE PILOT (calcul) |
| Communications | Appels (résumé/transcription IA), emails, SMS, WhatsApp | Intégrations (Brevo, WhatsApp, téléphonie) |
| Brief IA | Script prêt-à-appeler + objections + projets à proposer | THE PILOT (Claude) |
| Notes closer | Notes manuelles de Guillaume | THE PILOT |

### Limite KYC (NON NÉGOCIABLE)

"Ultra précis" porte sur le **comportement, le business, la communication, l'attribution**. PAS sur le KYC ultra-sensible :
- ❌ Numéro de pièce d'identité
- ❌ RIB / IBAN
- ❌ Scan de pièce d'identité

Ces données restent chez SAH (responsable KYC sous cadre ACPR). Cette limite ne bride en rien le tracking de rentabilité.

---

## 2. Le tableau de bord global (statistiques Seven)

La vue d'ensemble du business. Page : `/dashboard` (overview) + `/performance` (détail).

### Blocs du dashboard

| Bloc | Exemples de métriques |
|---|---|
| Collecte | Mois en cours, YTD, vs objectif 300K€/mois, projection fin de mois |
| Funnel | Inscrits → Onboardés → 1ers investisseurs → Ré-investisseurs (+ taux de passage à chaque étape) |
| ROI par canal d'acquisition | LinkedIn / Meta / Google / Parrainage / SEO : CPA, LTV, ROI |
| **ROI par action** ⭐ | Appel / SMS / WhatsApp / email : taux de conversion, € générés, délai moyen action→investissement |
| Performance par closer | Taux de transfo, ticket moyen, nb d'appels, pipeline |
| Performance par projet | Vitesse de collecte par projet (Brézins, Capsule…) |
| Pipeline | Nb de leads par étape + valeur potentielle |
| Cohortes | "Les investisseurs de janvier rapportent X sur 12 mois" |
| Forecasting | Projection de collecte à 3 / 6 / 12 mois, scénarios |
| Santé | Budget IA consommé, conformité AMF, alertes système |

Le bloc ⭐ **ROI par action** est l'objectif central de Killian : savoir quelle action génère quel retour.

---

## Lien attribution

Tout le dashboard "ROI par action / canal" est alimenté par le système d'attribution :

1. Chaque action sortante est loggée dans `interactions` (horodatée, typée, avec le closer).
2. Chaque investissement (`subscriptions`) déclenche un calcul : on regarde les actions dans la fenêtre d'attribution (ex 30j avant) et on attribue le mérite (last-touch en V1, multi-touch en V2 via `attribution_touches`).
3. Le dashboard agrège : "combien d'€ attribués aux appels ce mois", "quel canal convertit le mieux", etc.

**Condition de succès** : capturer TOUTES les actions (via l'app directement, ou sync depuis Brevo / WhatsApp API / téléphonie). Et recevoir l'événement souscription de SAH avec date précise + ID investisseur.

---

## Découpage par rôle

- **Guillaume (closer)** : vit dans les fiches (son métier). Ne voit que ses leads attribués.
- **Killian (admin)** : voit tout — fiches + dashboard global + config.
- **Stéphane / Céline (executive)** : vivent dans le dashboard global (piloter, décider). Read-only.

---

## État d'avancement (V0)

| Élément | État |
|---|---|
| Fiche investisseur (structure visuelle) | ✅ mockée (`/closing/investor/[id]`) |
| Timeline dans la fiche | ✅ mockée |
| Dashboard overview (KPI + alertes) | ✅ mocké (`/dashboard`) |
| Performance Lab (ROI par canal) | ✅ mocké (`/performance`) |
| ROI par action ⭐ | ❌ à concevoir + mocker |
| Système d'attribution (calcul réel) | ❌ V1+ (après branchement SAH) |
| Capture des actions (Brevo, WhatsApp, téléphonie) | ❌ après appel SAH + choix outils |

Prochaine étape data : appel technique SAH (cf. [appel-sah-questions.md](appel-sah-questions.md)).
