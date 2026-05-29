/**
 * Client OpenRouter — utilisé UNIQUEMENT par le module Social Hub.
 *
 * Modèles : Grok (recherche web + rédaction) et Nano Banana / Gemini Flash Image (visuels).
 *
 * ⚠️ CONFORMITÉ (CLAUDE.md : EU-only, pas de données hors UE) :
 * OpenRouter route vers des fournisseurs hors UE (xAI, Google). Ce client est donc
 * soumis à une BARRIÈRE ANTI-PII : aucune donnée personnelle d'investisseur ne doit
 * transiter. La fonction `assertNoInvestorPii` est appelée sur chaque prompt sortant
 * et lève une erreur si elle détecte un pattern de donnée personnelle.
 *
 * Le contenu social (marque, projets business, veille concurrents) ne contient pas de PII.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 90_000;

export const OPENROUTER_MODELS = {
  grok: process.env.OPENROUTER_GROK_MODEL ?? 'x-ai/grok-4.3',
  image: process.env.OPENROUTER_IMAGE_MODEL ?? 'google/gemini-3.1-flash-image-preview',
} as const;

export class OpenRouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

export class PiiLeakError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PiiLeakError';
  }
}

/* ============================================================
   BARRIÈRE ANTI-PII (garde-fou RGPD)
   ============================================================ */

// Patterns de données personnelles qui ne doivent JAMAIS partir vers OpenRouter.
const PII_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'email', re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i },
  { label: 'téléphone FR', re: /(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/ },
  { label: 'IBAN', re: /\b[A-Z]{2}\d{2}(?:[\s]?[A-Z0-9]{4}){2,}/ },
  { label: 'carte bancaire', re: /\b(?:\d[ -]?){13,19}\b/ },
];

/**
 * Vérifie qu'un texte sortant ne contient pas de PII investisseur.
 * Lève PiiLeakError si un pattern est détecté. À appeler avant tout envoi OpenRouter.
 */
export function assertNoInvestorPii(text: string): void {
  for (const { label, re } of PII_PATTERNS) {
    if (re.test(text)) {
      throw new PiiLeakError(
        `Donnée personnelle (${label}) détectée dans un prompt destiné à OpenRouter (hors UE). ` +
          `Envoi bloqué pour conformité RGPD. Le contenu social ne doit jamais inclure de PII investisseur.`,
      );
    }
  }
}

/* ============================================================
   APPELS
   ============================================================ */

function headers(): Record<string, string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new OpenRouterError('OPENROUTER_API_KEY manquante. Renseigne-la dans .env.local.');
  }
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    'X-Title': 'THE PILOT — Social Hub',
  };
}

async function postOpenRouter(payload: unknown): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new OpenRouterError(`OpenRouter HTTP ${res.status}: ${body.slice(0, 500)}`);
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (e) {
    if (e instanceof OpenRouterError) throw e;
    if (e instanceof Error && e.name === 'AbortError') {
      throw new OpenRouterError(`OpenRouter timeout après ${DEFAULT_TIMEOUT_MS}ms`);
    }
    throw new OpenRouterError(e instanceof Error ? e.message : 'Erreur OpenRouter inconnue');
  } finally {
    clearTimeout(timeout);
  }
}

type ChatChoice = { message?: { content?: string; images?: { image_url?: { url?: string } }[] } };

function firstContent(data: Record<string, unknown>): string {
  const choices = data.choices as ChatChoice[] | undefined;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new OpenRouterError('Réponse OpenRouter sans contenu texte exploitable.');
  }
  return content;
}

/**
 * Grok avec recherche web native activée. Pour idées et veille concurrentielle.
 */
export async function grokSearch(prompt: string, maxResults = 8): Promise<string> {
  assertNoInvestorPii(prompt);
  const data = await postOpenRouter({
    model: OPENROUTER_MODELS.grok,
    plugins: [{ id: 'web', engine: 'native', max_results: maxResults }],
    messages: [{ role: 'user', content: prompt }],
  });
  return firstContent(data);
}

/**
 * Grok en mode rédaction (sans recherche web). `jsonMode` force une sortie JSON.
 */
export async function grokChat(system: string, user: string, jsonMode = false): Promise<string> {
  assertNoInvestorPii(system);
  assertNoInvestorPii(user);
  const payload: Record<string, unknown> = {
    model: OPENROUTER_MODELS.grok,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  if (jsonMode) payload.response_format = { type: 'json_object' };
  const data = await postOpenRouter(payload);
  return firstContent(data);
}

/**
 * Génère une image via Nano Banana (Gemini Flash Image). Retourne le buffer + le mime.
 * Le stockage (Supabase Storage) est géré par l'appelant.
 */
export async function nanoBananaImage(prompt: string): Promise<{ buffer: Buffer; mime: string }> {
  assertNoInvestorPii(prompt);
  const data = await postOpenRouter({
    model: OPENROUTER_MODELS.image,
    messages: [{ role: 'user', content: prompt }],
  });
  const choices = data.choices as ChatChoice[] | undefined;
  const url = choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) {
    throw new OpenRouterError("Pas d'image dans la réponse Nano Banana.");
  }
  // Data URL base64 : data:image/jpeg;base64,xxxx
  const match = url.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) {
    throw new OpenRouterError('Format image inattendu (data URL base64 attendue).');
  }
  const mime = match[1] ?? 'image/jpeg';
  const base64 = match[2] ?? '';
  return { buffer: Buffer.from(base64, 'base64'), mime };
}
