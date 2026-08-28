/**
 * Appelle un endpoint de cron et rend un verdict HONNÊTE.
 *
 * Remplace les `node -e "fetch(...)"` en une ligne qui vivaient dans
 * render.yaml, et qui avaient deux défauts opposés :
 *
 *   · ILS TAISAIENT LES VRAIS ÉCHECS — `.then(() => process.exit(0))` sortait
 *     en succès même sur un HTTP 500. Une synchro cassée passait inaperçue.
 *   · ILS ALERTAIENT SUR DU BRUIT — la moindre coupure réseau, ou un appel
 *     tombant pendant un redéploiement (l'app répond 502 quelques secondes),
 *     déclenchait un mail « cron job failure ».
 *
 * Ici : plusieurs tentatives espacées, un timeout explicite, et un code de
 * sortie qui reflète ce qui s'est réellement passé.
 *
 * Usage : node scripts/cron-call.mjs URL_ENV_VAR [AUTRE_ENV_VAR…]
 *   Chaque argument nomme une variable d'environnement contenant une URL.
 *   Les URL sont appelées dans l'ordre ; le job échoue si l'une d'elles échoue.
 */

/** Tentatives par URL — couvre un redéploiement en cours. */
const ATTEMPTS = 3;
/** Attente entre deux tentatives. */
const RETRY_DELAY_MS = 15_000;
/** Au-delà, on considère que l'appel ne répondra pas. */
const TIMEOUT_MS = Number(process.env.CRON_TIMEOUT_MS ?? 290_000);

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error('Usage : node scripts/cron-call.mjs NOM_DE_VARIABLE [AUTRE…]');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Un appel : renvoie { ok, detail }. */
async function callOnce(url) {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status} — ${body.slice(0, 400)}` };

    // Nos endpoints répondent { ok: true|false, ... }. Un `ok:false` est un
    // échec applicatif : le job doit le dire, pas l'avaler.
    try {
      const json = JSON.parse(body);
      if (json && json.ok === false) {
        return { ok: false, detail: `réponse ok:false — ${body.slice(0, 400)}` };
      }
      // Erreurs partielles (une source en panne, le reste passé) : on les
      // affiche sans faire échouer le job — la synchro a fait son travail.
      if (Array.isArray(json?.errors) && json.errors.length > 0) {
        console.warn(`  ⚠︎ erreurs partielles : ${json.errors.join(' | ')}`);
      }
    } catch {
      // Réponse non-JSON : le statut HTTP fait foi, on ne présume rien.
    }
    return { ok: true, detail: body.slice(0, 400) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, detail: `appel impossible — ${message}` };
  }
}

let failures = 0;

for (const name of names) {
  const url = process.env[name];
  if (!url) {
    // Cause n°1 des « cron job failure » : la variable n'a jamais été renseignée
    // dans le dashboard Render. On le dit en toutes lettres.
    console.error(`✗ ${name} : variable d'environnement absente — rien à appeler.`);
    failures++;
    continue;
  }

  let last = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    last = await callOnce(url);
    if (last.ok) {
      console.log(`✓ ${name} (tentative ${attempt}) — ${last.detail}`);
      break;
    }
    console.warn(`… ${name} tentative ${attempt}/${ATTEMPTS} : ${last.detail}`);
    if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }

  if (!last.ok) {
    console.error(`✗ ${name} : échec après ${ATTEMPTS} tentatives — ${last.detail}`);
    failures++;
  }
}

process.exit(failures > 0 ? 1 : 0);
