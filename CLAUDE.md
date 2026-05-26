# CLAUDE.md — Instructions pour Claude Code sur THE PILOT

> **Lecture obligatoire avant toute session** : [THE_PILOT.md](./THE_PILOT.md) (la bible — 2288 lignes). Ce fichier est un résumé opérationnel, pas une alternative.
>
> Owner : Killian (BREACH) — Client : Seven At Home (SAH) — Version : v0 (scaffold)

---

## Contexte ultra-condensé

THE PILOT est une **app interne multi-utilisateurs** (admin, closer, executive) qui pilote toute l'opérationnel marketing + closing + data de SAH (plateforme privée d'investissement immobilier club deal). 5 modules métier : Closing, Email, Social, Ads, Performance. Couche transverse IA (scoring, briefs, AMF compliance, chat with your data).

**Cadre légal critique** : AMF DIS, ACPR KYC, RGPD EU-only. Toute communication externe scannée AMF avant envoi, validation humaine obligatoire.

---

## Stack (résumé — détail en section 8 de la bible)

- Next.js 16 (App Router) + TypeScript strict + Tailwind v4 + shadcn/ui
- Supabase (Postgres EU + Auth + RLS + Realtime + Storage) + Drizzle ORM
- Anthropic Claude API (Opus 4.7 + Haiku 4.5) + OpenAI Whisper
- Inngest (background jobs) + Vercel Cron
- Vercel hosting (région Frankfurt) + Cloudflare Access
- Biome (lint/format), Vitest (tests)

---

## Règles NON NÉGOCIABLES

### Sécurité & permissions
1. **RLS Supabase activée sur TOUTES les tables**, sans exception.
2. **Double-check côté code** dans chaque server action (defense in depth — ne jamais s'appuyer uniquement sur RLS).
3. **Pas de KYC dans les prompts LLM** (date de naissance complète, RIB, pièce ID). Seulement métadonnées.
4. **Aucun secret en dur**. Tout passe par `.env` (gitignored). Voir `.env.example`.
5. **2FA obligatoire** pour rôles `admin` et `closer`.

### AMF (compliance financière)
6. **Tout contenu sortant scanné** par [`src/lib/ai/amf-compliance.ts`](src/lib/ai/amf-compliance.ts) avant envoi.
7. **Termes interdits** (bloqués côté code) : `garanti`, `garantie`, `sans risque`, `risque zéro`, `sûr`, `certain`, `assuré`, `crowdfunding`, `financement participatif`.
8. **Mention obligatoire** quand un rendement est cité : `rendement cible, capital non garanti`.

### RGPD
9. **EU only** : Supabase Frankfurt + Vercel EU. Aucun transfert hors UE.
10. **Article 22** : aucune décision automatique significative affectant un investisseur sans human-in-the-loop.
11. **Audit log** : toute action sensible loggée via [`src/lib/audit.ts`](src/lib/audit.ts).

### IA
12. **Human-in-the-loop** sur toute communication externe (email, message, post). Bloqué côté code si `validated_by` absent.
13. **Pas d'hallucinations sur les chiffres** : chat IA répond uniquement après appel à un tool (function calling). Sinon : "je n'ai pas l'info".
14. **Logging exhaustif** de chaque appel LLM (table `llm_calls` — voir section 10 de la bible).
15. **Budget mensuel borné** par env var `ANTHROPIC_MAX_MONTHLY_EUR`.

---

## Conventions de code (résumé section 13)

- TypeScript strict, **jamais `any`**. Si besoin : `unknown` + narrowing.
- **Pas de `// @ts-ignore`**. Si besoin : `// @ts-expect-error` avec justification.
- Naming : `kebab-case.tsx` (fichiers), `PascalCase` (composants/types), `camelCase` (fonctions), `SCREAMING_SNAKE_CASE` (constantes globales), `snake_case` (colonnes DB).
- **Server Components > Server Actions > Client Components**. RSC par défaut. `'use client'` uniquement si nécessaire.
- **Server Actions > API Routes** pour les mutations internes.
- **Inngest** pour les jobs background, jamais `setInterval`.
- **Zod** pour valider tout input (server actions, route handlers, env vars).
- **Pas de try/catch silencieux**. Soit on attrape + log, soit on laisse remonter.
- **Composants shadcn/ui** > custom (sauf si vraiment besoin). Ajouter via `pnpm dlx shadcn@latest add <comp>`.
- **Tailwind utilities** > CSS custom.

---

## Pattern de Server Action (template à respecter)

```ts
'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

const schema = z.object({ /* ... */ });

export async function myAction(input: z.infer<typeof schema>) {
  const user = await getAuthenticatedUser();       // 1. Auth
  const parsed = schema.parse(input);              // 2. Validation
  await requireRole(user, ['admin', 'closer']);    // 3. Permission
  // ... 4. Mutation
  await logAudit({                                  // 5. Audit
    userId: user.id,
    action: 'resource.verb',
    resourceType: 'resource',
    resourceId: parsed.id,
  });
  revalidatePath('/...');                           // 6. Revalidate
  return { success: true };
}
```

---

## À NE JAMAIS faire sans demander explicitement à Killian

- Modifier le schéma RLS Supabase
- Modifier le système d'auth
- Bypass une vérification de permission
- Désactiver un test
- Ajouter une nouvelle dépendance lourde (>100KB)
- Envoyer des données vers un service hors EU
- Stocker du KYC en clair
- Hardcoder des credentials, même en dev
- Utiliser `// @ts-ignore`
- Mettre `eslint-disable` (ou `biome-ignore`) sans justification commentée
- Laisser un `console.log` qui restera en prod (utiliser le logger structuré)
- `git push --force` sur une branche partagée
- Modifier `package.json`, `tsconfig.json`, `next.config.ts`, `biome.json`, `drizzle.config.ts` sans m'avertir
- Installation de nouvelles dépendances (`pnpm add <truc>`)

---

## Workflow Claude Code recommandé pour une nouvelle feature

1. Lire le ticket Linear ou la demande de Killian.
2. Identifier les modules/tables impactés.
3. Lire les sections pertinentes de [THE_PILOT.md](./THE_PILOT.md).
4. Proposer un plan en 3-5 étapes à Killian **avant de coder**.
5. Coder étape par étape, commit à chaque étape.
6. Écrire les tests à mesure.
7. Faire tourner `pnpm lint && pnpm typecheck && pnpm test:run && pnpm build`.
8. Ouvrir une PR avec description en français.
9. Attendre la review.

---

## Definition of Done (avant de dire "c'est fait")

Lance dans cet ordre :

1. `pnpm lint` (Biome)
2. `pnpm typecheck` (tsc)
3. `pnpm test:run` (Vitest)
4. `pnpm build` (Next)

**Si l'un des quatre échoue, tu corriges avant de me rendre la main. Tu ne livres jamais du code rouge.**

---

## Communication avec Killian

- **Toujours en français**.
- Direct, pas de flatterie.
- En cas de désaccord : exposer ton point, ne pas céder facilement.
- Bloqué : poser la question, ne pas inventer.
- Urgence : flagger immédiatement.

---

## Pour aller plus loin

Tout le détail (data model complet, prompts IA, patterns code, intégrations externes, roadmap par version, risques connus) est dans [THE_PILOT.md](./THE_PILOT.md). Tu **dois** y revenir avant chaque décision non-triviale.
