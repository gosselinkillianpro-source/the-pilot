# THE PILOT

> Cabine de pilotage marketing 360 propulsée par IA, sur-mesure pour **Seven At Home** (plateforme privée d'investissement immobilier club deal).

**Statut** : V0 (scaffold) — **Owner** : Killian (BREACH) — **Client** : SAH

## Avant toute chose

- Lire [CLAUDE.md](./CLAUDE.md) (résumé opérationnel pour Claude Code)
- Lire [THE_PILOT.md](./THE_PILOT.md) (spec complète — 2288 lignes — **la bible**)

## Prérequis

- Node.js 20+ (testé sur Node 24)
- pnpm 10+ (`npm install -g pnpm`)
- Un compte Supabase (projet en région Frankfurt)
- Clés API : Anthropic, OpenAI, Brevo, Meta, Google Ads, Calendly

## Installation

```bash
pnpm install
cp .env.example .env.local
# remplir .env.local avec les vraies valeurs
```

## Commandes

| Commande | Description |
|---|---|
| `pnpm dev` | Lancer le serveur de dev (localhost:3000) |
| `pnpm build` | Build de production |
| `pnpm start` | Lancer le build de prod en local |
| `pnpm lint` | Lint via Biome |
| `pnpm lint:fix` | Lint + autofix |
| `pnpm format` | Format via Biome |
| `pnpm typecheck` | Vérification TypeScript (sans emit) |
| `pnpm test` | Tests Vitest (watch) |
| `pnpm test:run` | Tests Vitest (one-shot) |
| `pnpm test:ui` | UI Vitest interactive |
| `pnpm db:generate` | Drizzle : générer une migration |
| `pnpm db:migrate` | Drizzle : appliquer les migrations |
| `pnpm db:studio` | Drizzle Studio (UI DB) |

## Definition of Done

Avant tout merge sur `main` : `pnpm lint && pnpm typecheck && pnpm test:run && pnpm build` doivent tous passer.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind v4 · shadcn/ui · Supabase (Auth + DB EU) · Drizzle ORM · Anthropic Claude · OpenAI Whisper · Inngest · Vercel (Frankfurt) · Cloudflare Access · Biome · Vitest.

Détail complet : [section 8 de THE_PILOT.md](./THE_PILOT.md#8-stack-technique).

## Structure

Voir [section 14 de THE_PILOT.md](./THE_PILOT.md#14-structure-du-repository).

## Conformité

THE PILOT manipule des données financières d'investisseurs particuliers sous cadre **AMF DIS + ACPR KYC + RGPD**. Toute communication externe est scannée AMF avant envoi. Aucun KYC en clair dans les prompts LLM. Hébergement EU only. Voir [section 12 de THE_PILOT.md](./THE_PILOT.md#12-sécurité-et-conformité-réglementaire).

## Déploiement

`main` → push → Vercel preview/prod auto. Voir [section 15 de THE_PILOT.md](./THE_PILOT.md#15-workflow-git-cicd-et-déploiement).

---

© 2026 BREACH pour Seven Capital Invest SA. IP BREACH.

## Catalogue de métriques (source de vérité)

Chantier « confiance » : **aucun chiffre n'est affiché sans définition, source et fraîcheur consultables**.

- **Registre autoritaire** : [`src/lib/metrics/catalogue.ts`](src/lib/metrics/catalogue.ts) — la SEULE définition autorisée de chaque indicateur (definition · source unique · calcul · décision). Miroir lisible : [`CATALOGUE_METRIQUES.md`](CATALOGUE_METRIQUES.md).
- **État des sources** : [`src/lib/sources/health.ts`](src/lib/sources/health.ts) — probe en temps réel (base SAH, Brevo, Meta, Google) ; GA4/Calendly/WhatsApp = **non branchés** (affichés comme tels, jamais comme connectés). Helpers purs : [`freshness.ts`](src/lib/sources/freshness.ts).
- **Garde-fous de cohérence** : [`src/lib/metrics/guardrails.ts`](src/lib/metrics/guardrails.ts) — somme par projet = total, funnel monotone, jamais de moyenne sur 0 ; toute incohérence marque la métrique « à vérifier ».
- **Audit & inventaire** : [`AUDIT_PILOT.md`](AUDIT_PILOT.md) (179 métriques, hors closing).

### Ajouter une métrique
1. Ajouter une entrée dans `DEFS` de `src/lib/metrics/catalogue.ts` (id unique, definition, source, sourceDetail, calcul, unit, decision, screens). Le **test de lignée** (`tests/unit/metrics-catalogue.test.ts`) échoue si un attribut obligatoire manque.
2. Calculer la valeur dans la requête dédiée (`src/lib/db/queries/*` ou `src/lib/ads/*`) — jamais en dur dans un composant.
3. Mettre à jour `CATALOGUE_METRIQUES.md`.

### Ajouter une source
1. Ajouter le connecteur dans `src/lib/integrations/<source>/`.
2. Ajouter sa sonde dans `probeAllSources()` (`src/lib/sources/health.ts`) avec un état honnête (`ok`/`down`/`not_configured`/`not_connected`).

> Tests : `pnpm test:run` (lignée du catalogue, garde-fous sur jeu de référence, fraîcheur des sources).
