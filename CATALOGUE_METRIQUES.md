# CATALOGUE_METRIQUES.md — la source de vérité des chiffres de THE PILOT

> Document de **confiance**. Registre vivant et autoritaire : [`src/lib/metrics/catalogue.ts`](src/lib/metrics/catalogue.ts).
> Ce fichier en est le miroir lisible. Règle : **aucune métrique affichée sans entrée dans le catalogue.**
> Périmètre : tout sauf le module *closing*.

## Règle des 4 attributs obligatoires

Chaque métrique est définie par exactement :
1. **Définition** — en français, une phrase, sans ambiguïté.
2. **Source** — la source canonique **unique** (jamais une moyenne ou un mélange silencieux de deux sources).
3. **Calcul** — la formule / requête exacte, versionnée dans le code.
4. **Fraîcheur** — exposée à l'affichage selon la source (voir « État des sources »), jamais figée.

*(+ une **décision** servie : une métrique qui ne sert aucune décision n'a rien à faire en vue principale.)*

---

## Chiffres canoniques de référence (réconciliés le 2026-06-16)

**Source faisant foi : la base Seven At Home en temps réel** (jamais un export CSV figé).

| Chiffre canonique | Valeur | Calcul |
|---|---|---|
| Investisseurs (base totale) | **2 837** | `count(*) investors where deleted_at is null` |
| dont profil complété | 2 154 | `filter (registration_complete)` |
| dont onboardés (KYC) | 1 834 | `filter (onboarding_complete)` |
| dont ont investi | 1 357 | `count(distinct investor_id) subscriptions non annulées` |
| Collecte totale | **25 859 893 €** | `sum(amount) where status <> 'cancelled'` |
| Souscriptions (non annulées) | 14 185 | `count(*) where status <> 'cancelled'` |
| Annulées (exclues) | 3 566 274 € | `sum(amount) where status = 'cancelled'` |
| Ticket moyen / investisseur | **19 057 €** | collecte ÷ investisseurs distincts |

**Garde-fous vérifiés sur ces données réelles :** somme collecte par projet = total (**écart 0 €**) · funnel monotone (2 837 ≥ 2 154 ≥ 1 834 ≥ 1 357) · ont investi ≤ base totale. ✅

> **Note de réconciliation.** Les écarts historiques venaient de comptages mélangés : (a) Meta annonçait ~600 « inscrits » (pixel gonflé) là où SAH en a ~180 réels → THE PILOT ne compte plus que les vrais inscrits SAH ; (b) BREACH-VIP « ~100 k€ » sur la plateforme = montant **brut** incluant une souscription de 50 k€ **annulée** → le catalogue compte 51,5 k€ **encaissé** (non annulé). Désormais : un seul chiffre par métrique, calculé depuis la base SAH.

---

## État des sources (réel, pas annoncé)

Exposé en temps réel par [`src/lib/sources/health.ts`](src/lib/sources/health.ts).

| Source | État | Fraîcheur |
|---|---|---|
| **Base Seven At Home** (Postgres miroir) | ✅ branchée | `max(investors.updated_at)` ; périmée si > 2 h |
| **Brevo** (email) | ✅ branchée | temps réel (API) |
| **Meta Ads** | ✅ si clés présentes | temps réel (API) |
| **Google Ads** | ✅ si clés présentes | temps réel (API) |
| **GA4** | ❌ **non branché** (annoncé seulement) | — |
| **Calendly** | ❌ **non branché** (annoncé seulement) | — |
| **WhatsApp** | ❌ **non branché** | — |

⚠️ Tant que **Calendly** n'est pas branché, **aucune métrique « RDV pris » (funnel B) n'est réelle**.

---

## Métriques cataloguées

> La colonne *Source* est canonique et unique. *Dérivé* = croise plusieurs sources (détaillé dans le calcul).

### Base SAH — collecte & investisseurs
| id | Métrique | Définition | Calcul |
|---|---|---|---|
| `collecte_totale` | Collecte totale | € levés (souscriptions non annulées) | `sum(amount) where status<>'cancelled'` |
| `collecte_mois` | Collecte ce mois | € signés depuis le 1er du mois | `… and signed_at >= date_trunc('month', now())` |
| `investisseurs_total` | Investisseurs (base) | comptes non supprimés | `count(*) where deleted_at is null` |
| `investisseurs_ayant_investi` | Ont investi | personnes distinctes avec souscription non annulée | `count(distinct investor_id) filter (non annulé)` |
| `taux_onboarding_kyc` | Taux KYC | part onboarding_complete / total | `count filter(onboarding_complete) / nullif(total,0) *100` |
| `souscriptions_total` | Souscriptions | engagements non annulés | `count(*) filter (non annulé)` |
| `ticket_moyen_investisseur` | Ticket moyen / inv. | collecte ÷ investisseurs distincts | `collecte_totale / nullif(investisseurs,0)` |
| `souscriptions_annulees` | Annulées (exclues) | montant annulé (canceled_at SAH) | `sum(amount) filter (status='cancelled')` |

### BREACH (acquisition pubs)
| id | Métrique | Définition | Calcul |
|---|---|---|---|
| `breach_collecte` | Collecte BREACH | collecte des leads pubs | `sum(s.amount) where breach_level not null or bonus_code ilike '%breach%'` |
| `breach_leads` | Leads BREACH | investisseurs rattachés aux pubs | `count(*) filter (breach_level not null or bonus_code ilike '%breach%')` |

### Ads — coût réel croisé SAH (*dérivé*)
| id | Métrique | Définition | Calcul |
|---|---|---|---|
| `ads_depense` | Dépense ads | € dépensés (Meta+Google) sur la période | `sum(spend)` régies |
| `ads_cpa_reel` | CPA réel | dépense régie ÷ inscrits du code | `spend / inscrits_code` (null si 0) |
| `ads_cpi_reel` | CPI réel | dépense régie ÷ inscrits complets (profil+KYC) | `spend / complets_code` |
| `ads_cout_par_investisseur` | Coût / investisseur | dépense régie ÷ investisseurs du code | `spend / investisseurs_code` |
| `ads_investissement_moyen` | Invest. moyen (ads) | collecte du code ÷ investisseurs du code | `collecte_code / nullif(inv,0)` |
| `ads_rentabilite` | Rentabilité | invest. moyen ÷ coût/investisseur (>1 = rentable) | `invest_moyen / cout_par_inv` |

### Email (Brevo)
| id | Métrique | Définition | Calcul |
|---|---|---|---|
| `email_contacts` | Contacts Brevo | total contacts | API Brevo (temps réel) |
| `email_taux_ouverture_transac` | Taux ouverture transac. | ouverts ÷ délivrés (cumul) | `opens / nullif(delivered,0)` |

### Projets
| id | Métrique | Définition | Calcul |
|---|---|---|---|
| `projet_collecte` | Collecte par projet | € non annulé d'un projet | `sum(amount) filter (non annulé) group by project_id` |
| `projet_pourcent_finance` | % financé | part du cible collectée | `collecte / nullif(cible,0) *100` |

### Performance (attribution appels)
| id | Métrique | Définition | Calcul |
|---|---|---|---|
| `collecte_signee_periode` | Collecte signée (période) | € signé non annulé sur la période | `sum(amount) filter (non annulé, signed_at in période)` |
| `collecte_attribuee_appels` | Collecte attribuée aux appels | collecte − part non attribuée (fenêtre 30 j) | `totalAmount − unattributed.amount` |

---

## Ajouter une métrique / une source

Voir [README](README.md) § « Catalogue de métriques ». **Toute nouvelle métrique passe d'abord par `catalogue.ts`** (sinon le test de lignée échoue), avant tout affichage.
