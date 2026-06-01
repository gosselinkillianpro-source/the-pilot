# THE PILOT — Priorisation & Performance
### Document unique : calcul du score d'appel + attribution des actions · Seven At Home
*Version 1.0 · À charger comme contexte système de THE PILOT (modules Scoring et Performance)*

---

## 0. Comment lire ce document

Ce fichier contient **deux moteurs distincts** qui ne doivent jamais être confondus.

**Moteur 1 — Le scoring.** Il répond à la question « qui appeler, dans quel ordre, maintenant ? ». Il tourne en continu et produit une file d'appels priorisée pour les deux closers. C'est de la décision tournée vers l'avenir.

**Moteur 2 — L'attribution.** Il répond à la question « une fois qu'une action a eu lieu, à quel contact l'attribuer, et combien ça coûte et rapporte ? ». Il tourne après coup et produit des mesures de performance. C'est de la mesure tournée vers le passé.

Le scoring décide de l'action, l'attribution mesure son résultat. Les deux se nourrissent l'un l'autre via la boucle d'amélioration (section finale), mais leurs calculs sont indépendants.

Principe transversal : tout doit être transparent et explicable. Un closer doit toujours comprendre pourquoi une personne a tel score, et le calcul d'attribution doit être traçable. Le score est une aide à la décision, jamais une décision automatique opaque (exigence RGPD en contexte financier). Le closer garde toujours la main.

---
---

# PARTIE I — LE MOTEUR DE SCORING

---

## 1. Données disponibles

THE PILOT ne dispose que de ces données. Ne jamais inventer un signal hors de cette liste.

**Fiables (faits durs) :**
- Fiche investisseur : statut d'inscription, statut KYC, date d'inscription (ancienneté), capacité ou tranche déclarée si renseignée.
- Souscriptions : montant investi, nom du projet souscrit.
- Fiche projet liée à la souscription : date de remboursement estimée. **À reconstituer en croisant la date de souscription avec la durée du projet de la fiche projet.** C'est le signal le plus précieux et il n'existe pas tel quel ; ce croisement est à câbler en priorité.

**Moyennement fiable :** clic sur un lien email.

**Faible :** ouverture d'email (gonflée par la protection de confidentialité Apple Mail).

Tout le reste (temps sur page, visites répétées, simulateur) **n'est pas disponible** et n'entre jamais dans le calcul.

---

## 2. Le principe : urgence × valeur

Le score de priorisation combine deux composantes que THE PILOT calcule séparément.

**Le score d'urgence (0 à 100)** répond à « à quel point faut-il appeler maintenant ? ». Piloté par les événements de cycle de vie (échéance projet, statut KYC, ancienneté) et l'engagement email récent.

**Le multiplicateur de valeur (× 1.0 à × 3.0)** répond à « combien cet appel peut rapporter ? ». Piloté par le montant déjà investi ou la capacité déclarée. Il module la priorité, il ne déclenche jamais une priorité à lui seul.

Règle anti-erreur : un gros investisseur tiède ne passe jamais devant un petit investisseur brûlant. Le montant n'est pas le roi ; le moment et l'intention le sont. Le montant départage à chaleur comparable.

---

## 3. Les statuts et leurs files d'appel

THE PILOT range d'abord chaque personne selon son statut, qui détermine la file et le type d'appel. Le statut range, le score ordonne à l'intérieur de la file.

**Statut A — Inscription non finalisée.** A commencé son compte sans terminer. File : déblocage inscription. But : comprendre le blocage, accompagner pour finaliser. Appel court, pas de vente. Intention déjà démontrée.

**Statut B — Inscription finalisée, KYC non validé.** Compte créé mais pièce d'identité non validée, ce qui empêche d'investir. File : déblocage KYC. But : faire valider la pièce pour débloquer la capacité à investir, puis enchaîner sur un projet. Intention forte, frein administratif, excellent ratio effort / impact.

**Statut C — Inscrit complet, jamais investi, récent.** File : bienvenue / premier investissement. But : créer le lien, répondre aux questions, présenter un projet, amener au premier investissement.

**Statut D — Inscrit complet, jamais investi, ancien.** File : réactivation. But : seulement si un signal d'engagement récent existe, sinon laisser à l'automatisation email. Les inactifs anciens passent en dernier.

**Statut E — A investi.** File : réinvestissement / relation. Sous-cas prioritaire : un projet en cours approche de son remboursement, c'est le moment roi du réinvestissement. Sous-cas relationnel : a investi, touché des intérêts depuis plus de 6 mois, pas d'échéance proche ; appel de rétention à cantonner à un créneau dédié.

---

## 4. La règle des 48h sur les nouveaux inscrits (prime sur le score)

Règle métier qui prime sur la priorisation par score. **Tout nouvel inscrit (statut A ou B, et statut C récent) doit être appelé dans les 48h suivant son inscription, quel que soit son score.**

Justification : un contact frais a une fenêtre d'attention très courte. Plus on attend, plus le taux de réponse s'effondre. Rappeler vite n'est pas une question de score mais de ne pas laisser refroidir un contact chaud. Le but de l'appel est triple : valider les dernières étapes d'inscription ou de KYC, ou booker un RDV si le profil patrimonial est intéressant, ou conseiller les projets récents.

Fonctionnement : tant qu'un nouvel inscrit est dans sa fenêtre de 48h, il appartient à une file à délai garanti et doit être appelé même si son score est bas. Le score ne sert qu'à ordonner les nouveaux inscrits entre eux à l'intérieur de cette fenêtre (lequel appeler en premier), pas à décider s'ils méritent l'appel.

**Point de bascule capacité.** Cette règle n'est tenable que si le volume quotidien de nouveaux inscrits reste sous la capacité d'appel des deux closers. Tant que le volume est bas, le 48h est tenu sur tout le monde sans effort. Le jour où le marketing fait grimper les inscriptions au-delà de ce que deux closers peuvent traiter en 48h, deux options : recruter un closer, ou filtrer par score au-delà d'un seuil de volume (appeler en priorité les profils à capacité déclarée intéressante, et basculer les autres sur séquence email automatique). THE PILOT doit suivre le volume quotidien de nouveaux inscrits et alerter quand la capacité 48h est dépassée.

---

## 5. Le score d'urgence (table des points)

Score additif, transparent, plafonné entre 0 et 100. Toujours afficher le détail.

| Facteur | Condition | Points |
|---|---|---|
| **Échéance projet** (statut E) | Remboursement dans ≤ 14 jours | +45 |
| | Remboursement dans 15 à 30 jours | +32 |
| | Remboursement dans 31 à 60 jours | +18 |
| | Remboursement dans 61 à 120 jours | +8 |
| **Statut de base** | KYC non validé (B) | +35 |
| | Inscription non finalisée (A) | +30 |
| | Inscrit récent jamais investi (C) | +22 |
| | A investi, confiance établie (E) | +15 |
| | Inscrit ancien jamais investi (D) | +5 |
| **Ancienneté** (statuts C et D) | Inscrit depuis ≤ 7 jours | +12 |
| | Inscrit depuis 8 à 30 jours | +6 |
| | Inscrit depuis 31 à 90 jours | 0 |
| | Inscrit depuis plus de 90 jours sans action | −10 |
| **Clics email** (épisode actif) | 5 points par clic | +20 max |
| **Ouvertures email** (épisode actif) | 1 point par ouverture | +10 max |
| **A répondu à un email** | signal humain fort | +18 |
| **A cliqué sur le nouveau projet en cours** | intention sur un projet précis | +15 |
| **A contacté le SAV en étant inquiet** | investisseur fragile, mauvais moment pour vendre | −12 |

Règles de calcul :
- On additionne les facteurs applicables, puis on borne entre 0 et 100.
- L'échéance ne s'applique qu'aux personnes avec un projet en cours (statut E). Si plusieurs projets en cours, retenir l'échéance la plus proche et signaler le nombre total de projets actifs au closer.
- La pénalité SAV ne descend jamais sous 0, mais elle est toujours affichée car elle change la nature de l'appel (rassurer avant de proposer).

---

## 6. Le multiplicateur de valeur

| Montant cumulé déjà investi | Multiplicateur |
|---|---|
| 30 000 € et plus | × 3.0 |
| 15 000 à 29 999 € | × 2.4 |
| 8 000 à 14 999 € | × 1.9 |
| 3 000 à 7 999 € | × 1.5 |
| 500 à 2 999 € | × 1.2 |
| moins de 500 € ou jamais investi | × 1.0 |

Pour les personnes jamais investies (A à D), utiliser la capacité ou tranche déclarée au KYC si disponible ; à défaut, multiplicateur 1.0. Ne jamais surévaluer un potentiel non démontré. Les données de capacité ou patrimoine sont sensibles : leur usage est limité à l'estimation du multiplicateur et doit rester documenté (RGPD).

---

## 7. Fraîcheur de l'engagement email (refroidissement)

Les points d'engagement email (clics, ouvertures, réponse, clic projet) ne valent pleinement que s'ils sont récents. Ils sont pondérés selon le temps écoulé depuis la dernière action email :

| Jours depuis la dernière action email | Coefficient sur les points d'engagement |
|---|---|
| 0 à 3 jours | × 1.0 |
| 4 à 9 jours | × 0.7 |
| 10 à 20 jours | × 0.4 |
| 21 jours et plus | points d'engagement remis à 0 |

Le refroidissement ne s'applique **qu'aux points d'engagement email**. Les faits durs (statut, échéance projet, ancienneté) ne refroidissent pas : ce sont des états, pas des signaux ponctuels. Une échéance à 10 jours reste une échéance à 10 jours quelle que soit l'activité email. Ce mécanisme évite qu'une personne reste éternellement « chaude » grâce à un clic isolé tous les 20 jours.

---

## 8. Priorité finale et lecture

**Priorité = borne_0_100 ( score_urgence × (0.5 + multiplicateur × 0.22) )**

Cette forme fait que le multiplicateur module la priorité sans écraser la chaleur : un score d'urgence faible reste faible même avec gros multiplicateur ; un score élevé est récompensé davantage quand la valeur est forte. Formule à ajuster avec les données réelles (voir boucle d'amélioration).

Seuils de lecture :
- **≥ 70 : Hot.** À appeler en priorité aujourd'hui.
- **40 à 69 : Tiède.** À appeler aujourd'hui s'il reste du temps.
- **< 40 : Froid.** Laisser à l'automatisation email.

Rappel : la règle des 48h (section 4) prime sur ces seuils pour les nouveaux inscrits. Un nouvel inscrit froid reste à appeler dans sa fenêtre de 48h.

Affichage obligatoire pour chaque personne : la file et le but de l'appel, les trois facteurs principaux du score (ex. « échéance 10j, 2 clics, capacité 15K »), la date de dernière action et l'état de fraîcheur, et tout signal négatif (SAV). Cette transparence fait que le closer fait confiance à l'outil et satisfait l'exigence RGPD.

---

## 9. Ordre de traitement des files dans la journée

1. **Nouveaux inscrits dans la fenêtre 48h** (statuts A, B, C récents). Délai garanti, prime sur tout. Ordonnés entre eux par le score.
2. **Réinvestissement à échéance proche** (statut E, remboursement ≤ 30 jours). Fenêtre courte, probabilité haute, valeur élevée.
3. **Déblocage KYC** (statut B hors fenêtre 48h). Intention forte, frein administratif.
4. **Déblocage inscription** (statut A hors fenêtre 48h). Intention démontrée, à relancer vite.
5. **Bienvenue / premier investissement** (statut C hors fenêtre 48h). Le score trie selon l'engagement.
6. **Réactivation** (statut D). Seulement ceux avec un sursaut d'engagement récent.
7. **Relationnel** (statut E sans échéance proche, +6 mois). Créneau dédié uniquement, jamais au détriment des files de conversion.

Garde de bon sens : ne jamais laisser la file relationnelle consommer le temps des files de conversion. Elle est confortable mais peu productive en collecte ; elle sert la rétention.

---
---

# PARTIE II — LE MOTEUR D'ATTRIBUTION

---

## 10. Rôle

L'attribution rattache une **action de l'investisseur** à un **point de contact**, pour calculer le coût par action et le gain par action. C'est de la mesure après coup, indépendante du scoring. Elle permet de répondre à : combien coûte une inscription complétée, combien rapporte un appel, l'email convertit-il mieux que l'appel.

---

## 11. Actions mesurées et points de contact

**Actions** (par valeur croissante) :
- Complétion d'inscription (inscription commencée puis finalisée).
- Validation KYC (pièce d'identité validée, la personne peut investir).
- Souscription (investissement effectif, avec montant ; porte le gain financier).

Chaque action est horodatée ; cette date sert de référence pour remonter la fenêtre.

**Points de contact** :
- Appel d'un closer (le plus coûteux et le plus déterminant).
- Clic sur un lien email.
- Ouverture d'email (signal faible, conservé pour l'analyse).

Chaque point de contact est horodaté et rattaché à une personne.

---

## 12. La règle d'attribution

**Fenêtre de 30 jours.** Une action n'est attribuée qu'à un contact survenu dans les 30 jours qui la précèdent. Tout contact plus ancien que 30 jours avant l'action est ignoré.

**Last touch.** Quand plusieurs contacts existent dans la fenêtre, l'action est attribuée au dernier contact en date avant l'action. On ne répartit pas le mérite, on attribue au plus récent.

**L'appel prime toujours.** Exception qui prime sur le last touch : si un appel de closer a eu lieu dans la fenêtre de 30 jours, l'action lui est attribuée, même si un clic ou une ouverture email est survenu plus récemment. Justification : l'appel est le contact le plus coûteux et le plus déterminant ; un clic qui suit un appel est souvent une conséquence de l'appel, pas une cause indépendante. S'il y a eu plusieurs appels, attribuer au plus récent.

**Action non attribuée.** Si aucun contact n'existe dans les 30 jours précédant l'action, l'action est marquée non attribuée. C'est normal et utile : ça mesure la part de conversions spontanées et évite d'attribuer un mérite à un contact trop ancien.

**Ordre de décision (résumé) :**
1. Un appel de closer dans les 30 jours avant l'action ? Si oui, attribuer au plus récent appel. Fin.
2. Sinon, un clic ou une ouverture dans les 30 jours ? Si oui, attribuer au plus récent (last touch). Fin.
3. Sinon, marquer non attribuée.

---

## 13. Coût par action

**Coût d'un appel** = coût horaire chargé d'un closer × durée moyenne d'un appel. Ces deux paramètres sont en configuration ; ne jamais les inventer, les chiffres réels priment.

**Coût d'un email** : marginal, traité comme négligeable face au coût d'un appel par défaut, sauf si on veut une mesure fine répartie sur le budget marketing.

**Coût par action attribuée** = total du coût des contacts attribués à un type d'action, divisé par le nombre de ces actions. Donne par exemple « une inscription complétée via appel coûte X € de temps closer ».

---

## 14. Gain par action

**Gain d'une souscription** = montant souscrit × marge opérateur (20% de la collecte, valeur de référence connue, à confirmer en configuration). Les actions intermédiaires (complétion d'inscription, validation KYC) n'ont pas de gain financier direct ; leur valeur est d'amener vers la souscription, mesurable via le taux de passage de l'étape vers la souscription.

**Gain par levier** = somme des gains des souscriptions attribuées à ce levier (appel, email). Permet de comparer ce que rapporte en moyenne un appel contre un clic email.

**Rentabilité d'un levier** = gain attribué / coût du levier. Pour les appels, répond directement à « le temps des closers est-il rentable, et sur quelles files l'est-il le plus ». Croisé avec les files de la Partie I, indique quelles files méritent le plus de temps de closer.

---

## 15. Limites de l'attribution à garder en tête

- Le modèle « l'appel prime » crédite généreusement les appels. C'est assumé (on veut savoir si le temps closer se rentabilise), mais il sous-estime le rôle du marketing email qui prépare le terrain avant l'appel. Ne pas lire « l'email convertit peu » comme « l'email est inutile ».
- La fenêtre de 30 jours est un réglage. Si les cycles de décision sur gros tickets dépassent 30 jours, des souscriptions tomberont en non attribué alors qu'un appel ancien y a contribué. Surveiller la part de non attribué sur les souscriptions ; si elle est élevée, allonger la fenêtre pour ce type d'action.
- Cette mesure interne ne se confond pas avec l'attribution marketing externe (canaux Meta, Google), qui suit ses propres règles.

---
---

# PARTIE III — LA BOUCLE D'AMÉLIORATION

---

## 16. Comment les deux moteurs se nourrissent

Les poids du scoring (Parties I, sections 5, 6, 8) sont fixés à l'intuition. L'attribution (Partie II) fournit la vérité terrain pour les corriger.

Mécanisme : pour chaque personne appelée, THE PILOT enregistre le score qu'elle avait au moment de l'appel, puis l'attribution mesure l'issue (a complété, a validé KYC, a souscrit, rien). Après un volume suffisant :
- Comparer les scores aux issues réelles. Les hauts scores convertissaient-ils vraiment mieux ?
- Si un facteur ne discrimine pas (ex. les ouvertures email ne prédisent rien), réduire son poids.
- Si un facteur sous-estimé prédit bien, augmenter son poids.
- Croiser la rentabilité par file (Partie II, section 14) avec l'ordre des files (Partie I, section 9). Si une file placée haut se révèle peu rentable, réajuster.

C'est cette boucle qui transforme un score « à l'intuition » en score « prouvé par les données de Seven At Home ». Tant que le volume est faible, garder les poids actuels et rester prudent.

---

## 17. Garde-fous transversaux

- Le score est une aide à la priorisation, jamais une décision automatique finale. Le closer garde la main.
- Toujours pouvoir expliquer un score et une attribution (transparence, RGPD, contexte financier).
- Ne jamais utiliser de donnée non disponible (Partie I, section 1).
- Les données sensibles (capacité, patrimoine) servent uniquement à l'estimation du multiplicateur de valeur, usage documenté.
- Un investisseur ayant contacté le SAV en étant inquiet n'est pas écarté mais signalé : l'appel doit d'abord rassurer.
- Les paramètres chiffrés (coût horaire closer, marge 20%, durée moyenne d'appel) sont en configuration et priment sur toute valeur codée en dur.

---
*Fin du fichier. THE PILOT — Priorisation & Performance v1.0 · BREACH × Seven At Home*
