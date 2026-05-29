/**
 * Moteur de visuels Seven At Home — rend des cartes/slides HTML autonomes (1080x1350).
 * Port de sah-social/core/post_visuals.py + slide_layouts.py.
 *
 * - `renderPostCard` : visuel d'un post simple (typo pure ou image en fond).
 * - `renderSlide`    : une slide de carrousel, layout varié (hero, two_cards, bullets,
 *                      mixed, compare, stats, cta_final).
 *
 * Mode `export` : dimensions fixes en px + image en data URI (pour Figma / fichier autonome).
 * Sinon : clamp/vw responsive, image en URL (pour aperçu iframe).
 */

export type PostForVisual = {
  platform: string;
  text: string;
  isCarousel: boolean;
  noImage: boolean;
  imageDataUri?: string | null; // data:... (déjà résolu par l'appelant)
};

export type IdeaForVisual = {
  title: string | null;
  category: string | null;
  angle: string | null;
};

export type SlideData = {
  layout?: string;
  section_label?: string;
  tag?: string;
  title?: string;
  body?: string;
  highlight?: string;
  cta?: string;
  sub_cards?: { label?: string; title?: string; body?: string }[];
  mini_cards?: { title?: string; label?: string }[];
  bullets?: string[];
  highlight_dark?: { title?: string; body?: string };
  card_light?: { label?: string; bullets?: string[] };
  card_dark?: { label?: string; title?: string; body?: string };
  stats?: { value?: string; label?: string; sub?: string }[];
};

const CATEGORY_TAGS: Record<string, string> = {
  projets: 'Opportunité à financer',
  pedagogique: "Comprendre l'investissement",
  temoignages: 'Ils nous font confiance',
  mise_avant: 'Seven At Home',
};

const CATEGORY_CTA: Record<string, string> = {
  projets: 'Découvrir nos opérations',
  pedagogique: 'En savoir plus',
  temoignages: 'Rejoindre la communauté',
  mise_avant: 'Demander votre accès',
};

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** **mot** -> accent or (Fraunces italique). */
function accent(title: string): string {
  return esc(title).replace(/\*\*([^*]+?)\*\*/g, '<span class="accent">$1</span>');
}

/** Met le dernier mot du titre en accent si aucun **...** n'est présent. */
function autoAccent(title: string): string {
  if (title.includes('**')) return accent(title);
  const safe = esc(title.trim());
  const parts = safe.split(' ');
  if (parts.length < 2) return safe;
  const last = parts.pop();
  return `${parts.join(' ')} <span class="accent">${last}</span>`;
}

function shortBody(text: string, max = 220): string {
  if (!text) return '';
  let t = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/#\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > max) {
    const cut = t.slice(0, max);
    const lastDot = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
    t = lastDot > max - 80 ? cut.slice(0, lastDot + 1) : `${cut.trim()}…`;
  }
  return esc(t);
}

const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Fraunces:ital,wght@1,400;1,500;1,600&display=swap');";

/** Convertit clamp(min, pref, max) -> max et fige le body en 1080x1350 (mode export). */
function toExport(html: string): string {
  return html
    .replace(/clamp\([^,]+,[^,]+,\s*([^)]+)\)/g, '$1')
    .replace(
      'html, body { width: 100%; height: 100%; overflow: hidden; }',
      'html, body { width: 1080px; height: 1350px; margin: 0; overflow: hidden; }',
    )
    .replace(/aspect-ratio: 4 \/ 5;/g, '');
}

/* ============================================================
   CARTE DE POST SIMPLE
   ============================================================ */
export function renderPostCard(
  post: PostForVisual,
  idea: IdeaForVisual,
  opts: { export?: boolean } = {},
): string {
  const category = (idea.category ?? 'mise_avant').toLowerCase();
  const title = idea.title ?? 'Seven At Home';
  const body = shortBody(post.text ?? '');
  const tag = CATEGORY_TAGS[category] ?? 'Seven At Home';
  const cta = CATEGORY_CTA[category] ?? 'sevenathome.com';
  const platform = (post.platform ?? '').toUpperCase();

  const hasImage = !post.noImage && Boolean(post.imageDataUri);
  const isDark = category === 'projets' || category === 'mise_avant' || hasImage;

  let bgOverlay: string;
  let textColor: string;
  let bodyColor: string;
  let borderColor: string;
  let tagBg: string;
  let tagBorder: string;
  let taglineColor: string;
  let gridColor: string;

  if (hasImage) {
    bgOverlay = `linear-gradient(180deg, rgba(26,26,26,0.55) 0%, rgba(26,26,26,0.25) 30%, rgba(26,26,26,0.92) 100%), url('${post.imageDataUri}') center/cover no-repeat`;
    textColor = '#FFFFFF';
    bodyColor = 'rgba(255,255,255,0.92)';
    borderColor = 'rgba(255,255,255,0.18)';
    tagBg = 'rgba(218,201,154,0.22)';
    tagBorder = 'rgba(218,201,154,0.55)';
    taglineColor = 'rgba(255,255,255,0.72)';
    gridColor = 'rgba(255,255,255,0)';
  } else if (isDark) {
    bgOverlay =
      'radial-gradient(ellipse 70% 50% at 100% 0%, rgba(218,201,154,0.22), transparent 60%), radial-gradient(ellipse 55% 40% at 0% 100%, rgba(218,201,154,0.10), transparent 60%), linear-gradient(135deg, #1A1A1A 0%, #232323 100%)';
    textColor = '#FFFFFF';
    bodyColor = 'rgba(255,255,255,0.82)';
    borderColor = 'rgba(255,255,255,0.12)';
    tagBg = 'rgba(218,201,154,0.18)';
    tagBorder = 'rgba(218,201,154,0.40)';
    taglineColor = 'rgba(255,255,255,0.58)';
    gridColor = 'rgba(218,201,154,0.045)';
  } else {
    bgOverlay =
      'radial-gradient(ellipse 70% 50% at 100% 0%, rgba(218,201,154,0.30), transparent 60%), radial-gradient(ellipse 55% 40% at 0% 100%, rgba(218,201,154,0.16), transparent 60%), linear-gradient(135deg, #FCFBF8 0%, #F4F2EC 100%)';
    textColor = '#1A1A1A';
    bodyColor = 'rgba(26,26,26,0.74)';
    borderColor = 'rgba(26,26,26,0.10)';
    tagBg = 'rgba(218,201,154,0.30)';
    tagBorder = 'rgba(191,169,110,0.55)';
    taglineColor = 'rgba(26,26,26,0.55)';
    gridColor = 'rgba(26,26,26,0.03)';
  }

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><style>
${FONT_IMPORT}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html, body { width: 100%; height: 100%; overflow: hidden; }
body{font-family:'Inter',-apple-system,sans-serif;background:#FBFAF7;color:${textColor};-webkit-font-smoothing:antialiased;display:flex}
.card{width:100%;height:100%;aspect-ratio: 4 / 5;padding:7% 6.5%;display:flex;flex-direction:column;justify-content:space-between;position:relative;background:${bgOverlay};overflow:hidden}
.card::after{content:"";position:absolute;inset:0;background-image:linear-gradient(${gridColor} 1px,transparent 1px),linear-gradient(90deg,${gridColor} 1px,transparent 1px);background-size:5% 5%;pointer-events:none;z-index:0}
.card::before{content:"";position:absolute;left:6.5%;right:6.5%;top:0;height:2px;background:linear-gradient(90deg,transparent,rgba(218,201,154,0.65) 50%,transparent);z-index:1}
.card>*{position:relative;z-index:1}
.head{display:flex;align-items:center;justify-content:space-between}
.logo{color:#DAC99A;font-weight:700;font-size:clamp(11px,1.8vw,22px);letter-spacing:0.18em;text-transform:uppercase}
.platform{color:${taglineColor};font-size:clamp(9px,1.3vw,14px);letter-spacing:0.1em;text-transform:uppercase;font-weight:500}
.main{margin-top:auto;margin-bottom:auto}
.tag{display:inline-flex;align-items:center;gap:8px;padding:0.65em 1.4em;background:${tagBg};border:1px solid ${tagBorder};border-radius:100px;color:#BFA96E;font-size:clamp(11px,1.7vw,18px);font-weight:600;margin-bottom:3.5%}
.tag::before{content:"";width:6px;height:6px;border-radius:50%;background:#DAC99A;box-shadow:0 0 8px rgba(218,201,154,0.6)}
.title-wrap{display:flex;align-items:flex-start;gap:4%;margin-bottom:4%}
.title-bar{width:4px;align-self:stretch;background:linear-gradient(180deg,#DAC99A,#BFA96E);border-radius:100px;flex-shrink:0;box-shadow:0 0 12px rgba(218,201,154,0.4)}
.title{font-size:clamp(34px,8.8vw,92px);font-weight:800;line-height:1.02;letter-spacing:-0.03em;color:${textColor};flex:1}
.title .accent{font-family:'Fraunces',Georgia,serif;font-style:italic;font-weight:500;color:#DAC99A;letter-spacing:-0.01em}
.body{font-size:clamp(13px,2.4vw,26px);line-height:1.5;color:${bodyColor};max-width:92%}
.footer{display:flex;align-items:center;justify-content:space-between;border-top:1px solid ${borderColor};padding-top:5%}
.tagline{color:${taglineColor};font-size:clamp(10px,1.5vw,16px);letter-spacing:0.05em;font-weight:500}
.cta{background:#1A1A1A;color:#fff;padding:0.85em 1.8em;border-radius:12px;font-weight:600;font-size:clamp(11px,1.6vw,17px);box-shadow:0 6px 24px rgba(26,26,26,0.18);display:inline-flex;align-items:center;gap:0.6em}
.cta::after{content:"→";font-size:1.1em}
</style></head><body>
<div class="card">
<div class="head"><span class="logo">Seven At Home</span><span class="platform">${esc(platform)}</span></div>
<div class="main"><div class="tag">${esc(tag)}</div><div class="title-wrap"><div class="title-bar"></div><h1 class="title">${autoAccent(title)}</h1></div><p class="body">${body}</p></div>
<div class="footer"><span class="tagline">sevenathome.com</span><span class="cta">${esc(cta)}</span></div>
</div></body></html>`;

  return opts.export ? toExport(html) : html;
}

/* ============================================================
   SLIDES DE CARROUSEL — layouts variés
   ============================================================ */
function layoutBody(slide: SlideData): string {
  const layout = (slide.layout ?? 'text').toLowerCase();
  const title = autoAccent(slide.title ?? '');
  const body = esc(slide.body ?? '');

  if (layout === 'hero') {
    return `<div class="s-content"><h1 class="s-title s-title-xl">${title}</h1>${body ? `<p class="s-body s-body-lg">${body}</p>` : ''}${
      slide.highlight
        ? `<div class="s-highlight"><div class="s-highlight-icon">↗</div><div>${esc(slide.highlight)}</div></div>`
        : ''
    }${slide.cta ? `<div class="s-cta-row"><span class="s-cta-pill">${esc(slide.cta)} →</span></div>` : ''}</div>`;
  }

  if (layout === 'two_cards') {
    const cards = (slide.sub_cards ?? [])
      .slice(0, 2)
      .map(
        (c) =>
          `<div class="s-card"><div class="s-card-label">${esc(c.label ?? '')}</div><div class="s-card-title">${esc(c.title ?? '')}</div><div class="s-card-body">${esc(c.body ?? '')}</div></div>`,
      )
      .join('');
    return `<div class="s-content"><h1 class="s-title">${title}</h1><div class="s-cards-row">${cards}</div>${
      slide.highlight
        ? `<div class="s-highlight"><div class="s-highlight-icon">◎</div><div>${esc(slide.highlight)}</div></div>`
        : ''
    }</div>`;
  }

  if (layout === 'bullets') {
    const items = (slide.bullets ?? [])
      .map((b) => `<li><span class="s-check">✓</span><span>${esc(b)}</span></li>`)
      .join('');
    const dark = slide.highlight_dark;
    return `<div class="s-content"><h1 class="s-title">${title}</h1><div class="s-card s-card-bullets"><div class="s-card-label">CE QU'IL FAUT RETENIR</div><ul class="s-bullets">${items}</ul></div>${
      dark
        ? `<div class="s-dark-bar"><div class="s-dark-title">${esc(dark.title ?? '')}</div><div class="s-dark-body">${esc(dark.body ?? '')}</div></div>`
        : ''
    }</div>`;
  }

  if (layout === 'mixed') {
    const big = (slide.sub_cards ?? [])
      .slice(0, 2)
      .map(
        (c) =>
          `<div class="s-card"><div class="s-card-label">${esc(c.label ?? '')}</div><div class="s-card-title">${esc(c.title ?? '')}</div><div class="s-card-body">${esc(c.body ?? '')}</div></div>`,
      )
      .join('');
    const mini = (slide.mini_cards ?? [])
      .slice(0, 3)
      .map(
        (m) =>
          `<div class="s-mini"><div class="s-mini-title">${esc(m.title ?? '')}</div><div class="s-mini-label">${esc(m.label ?? '')}</div></div>`,
      )
      .join('');
    return `<div class="s-content"><h1 class="s-title">${title}</h1><div class="s-cards-row">${big}</div><div class="s-mini-row">${mini}</div></div>`;
  }

  if (layout === 'compare') {
    const light = slide.card_light ?? {};
    const dark = slide.card_dark ?? {};
    const lb = (light.bullets ?? [])
      .map((b) => `<li><span class="s-check">✓</span><span>${autoAccent(b)}</span></li>`)
      .join('');
    return `<div class="s-content"><h1 class="s-title">${title}</h1><div class="s-compare-row"><div class="s-card s-card-light"><div class="s-card-label">${esc(light.label ?? '')}</div><ul class="s-bullets">${lb}</ul></div><div class="s-card s-card-dark"><div class="s-card-label dark">${esc(dark.label ?? '')}</div><div class="s-card-title white">${esc(dark.title ?? '')}</div><div class="s-card-body white">${esc(dark.body ?? '')}</div></div></div></div>`;
  }

  if (layout === 'stats') {
    const items = (slide.stats ?? [])
      .slice(0, 3)
      .map(
        (s) =>
          `<div class="s-stat"><div class="s-stat-value">${autoAccent(s.value ?? '')}</div><div class="s-stat-label">${esc(s.label ?? '')}</div>${s.sub ? `<div class="s-stat-sub">${esc(s.sub)}</div>` : ''}</div>`,
      )
      .join('');
    return `<div class="s-content"><h1 class="s-title">${title}</h1><div class="s-stats-row">${items}</div></div>`;
  }

  if (layout === 'cta_final') {
    return `<div class="s-content"><h1 class="s-title s-title-xl">${title}</h1>${body ? `<p class="s-body s-body-lg">${body}</p>` : ''}<div class="s-cta-row"><span class="s-cta-big">${esc(slide.cta ?? 'Rejoindre la communauté')} →</span></div></div>`;
  }

  return `<div class="s-content"><h1 class="s-title">${title}</h1>${body ? `<p class="s-body">${body}</p>` : ''}</div>`;
}

const SLIDE_CSS = `
.s-content{width:100%}
.s-title{font-weight:800;line-height:1.04;letter-spacing:-0.03em;font-size:clamp(28px,6.4vw,70px);margin-bottom:3.5%}
.s-title-xl{font-size:clamp(34px,7.6vw,84px)}
.s-title .accent{font-family:'Fraunces',Georgia,serif;font-style:italic;font-weight:500;color:#DAC99A;letter-spacing:-0.01em}
.s-body{font-size:clamp(13px,2.3vw,22px);line-height:1.55;color:rgba(26,26,26,0.74);margin-bottom:4%;max-width:88%}
.s-body-lg{font-size:clamp(14px,2.5vw,24px)}
.s-highlight{display:flex;align-items:center;gap:16px;background:#fff;border-radius:18px;padding:clamp(14px,2.2vw,22px) clamp(16px,2.5vw,28px);box-shadow:0 6px 24px rgba(0,0,0,0.06);margin-top:3%;font-size:clamp(12px,2vw,20px);line-height:1.45;color:#1A1A1A}
.s-highlight-icon{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#DAC99A,#BFA96E);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;flex-shrink:0;box-shadow:0 4px 12px rgba(218,201,154,0.35)}
.s-cta-row{display:flex;justify-content:center;margin-top:4%}
.s-cta-pill{background:#1A1A1A;color:#fff;padding:clamp(10px,1.5vw,16px) clamp(20px,3vw,36px);border-radius:100px;font-weight:600;font-size:clamp(12px,2vw,20px);box-shadow:0 8px 32px rgba(26,26,26,0.25),0 0 0 4px rgba(218,201,154,0.18)}
.s-cta-big{background:linear-gradient(135deg,#1A1A1A,#2A2A2A);color:#fff;padding:clamp(14px,2vw,22px) clamp(28px,4vw,48px);border-radius:18px;font-weight:700;font-size:clamp(14px,2.2vw,24px);box-shadow:0 10px 36px rgba(26,26,26,0.28)}
.s-cards-row{display:grid;grid-template-columns:1fr 1fr;gap:clamp(10px,1.8vw,20px);margin-bottom:3%}
.s-card{background:#fff;border-radius:16px;padding:clamp(14px,2vw,24px);box-shadow:0 4px 18px rgba(0,0,0,0.05)}
.s-card-label{font-size:clamp(9px,1.2vw,13px);font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#BFA96E;margin-bottom:8px}
.s-card-label.dark{color:#DAC99A}
.s-card-title{font-size:clamp(14px,2.4vw,24px);font-weight:700;line-height:1.15;color:#1A1A1A;margin-bottom:6px}
.s-card-title.white{color:#fff}
.s-card-body{font-size:clamp(11px,1.8vw,17px);line-height:1.5;color:rgba(26,26,26,0.72)}
.s-card-body.white{color:rgba(255,255,255,0.85)}
.s-bullets{list-style:none;padding:0;margin:0}
.s-bullets li{display:flex;align-items:flex-start;gap:12px;padding:clamp(6px,1vw,10px) 0;font-size:clamp(12px,2vw,19px);line-height:1.4;color:#1A1A1A}
.s-card-dark .s-bullets li{color:rgba(255,255,255,0.92)}
.s-check{width:clamp(20px,2.6vw,28px);height:clamp(20px,2.6vw,28px);border-radius:50%;background:rgba(218,201,154,0.25);color:#BFA96E;display:inline-flex;align-items:center;justify-content:center;font-size:0.9em;font-weight:700;flex-shrink:0}
.s-card-bullets{padding:clamp(18px,2.5vw,30px)}
.s-dark-bar{background:#1A1A1A;border-radius:18px;padding:clamp(16px,2.3vw,26px);color:#fff;display:grid;grid-template-columns:1fr 1.4fr;gap:clamp(10px,1.8vw,24px);margin-top:3%;box-shadow:0 8px 28px rgba(26,26,26,0.18)}
.s-dark-title{font-weight:800;font-size:clamp(15px,2.4vw,28px);line-height:1.15}
.s-dark-body{font-size:clamp(11px,1.7vw,17px);line-height:1.5;color:rgba(255,255,255,0.82)}
.s-mini-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:clamp(8px,1.5vw,16px)}
.s-mini{background:#fff;border-radius:14px;padding:clamp(12px,1.8vw,22px);box-shadow:0 4px 14px rgba(0,0,0,0.05)}
.s-mini-title{font-weight:800;font-size:clamp(18px,3vw,36px);color:#1A1A1A;line-height:1;margin-bottom:6px}
.s-mini-label{font-size:clamp(9px,1.2vw,13px);font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:rgba(26,26,26,0.5)}
.s-compare-row{display:grid;grid-template-columns:1fr 1fr;gap:clamp(10px,1.8vw,22px)}
.s-card-dark{background:linear-gradient(135deg,#2A2A2A,#1A1A1A);color:#fff}
.s-stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(12px,2vw,24px)}
.s-stat{text-align:center;padding:clamp(14px,2vw,24px);background:#fff;border-radius:16px;box-shadow:0 4px 18px rgba(0,0,0,0.05)}
.s-stat-value{font-weight:800;font-size:clamp(32px,6vw,72px);color:#1A1A1A;line-height:1;margin-bottom:6px;letter-spacing:-0.03em}
.s-stat-value .accent{font-family:'Fraunces',Georgia,serif;font-style:italic;font-weight:500;color:#DAC99A}
.s-stat-label{font-size:clamp(10px,1.4vw,16px);font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#BFA96E;margin-bottom:4px}
.s-stat-sub{font-size:clamp(10px,1.5vw,15px);color:rgba(26,26,26,0.6)}
`;

export function renderSlide(
  slide: SlideData,
  slideIndex: number,
  _totalSlides: number,
  post: PostForVisual,
  idea: IdeaForVisual,
  opts: { export?: boolean } = {},
): string {
  const category = (idea.category ?? 'mise_avant').toLowerCase();
  const sectionLabel = (
    slide.section_label ??
    CATEGORY_TAGS[category] ??
    'SEVEN AT HOME'
  ).toUpperCase();
  const cornerTag = slide.tag ?? `Slide ${slideIndex + 1}`;
  const pageNum = String(slideIndex + 1).padStart(2, '0');
  const hasImage = !post.noImage && Boolean(post.imageDataUri);

  const slideBg = hasImage
    ? `linear-gradient(180deg, rgba(251,250,247,0.65) 0%, rgba(251,250,247,0.78) 40%, rgba(251,250,247,0.92) 100%), url('${post.imageDataUri}') center/cover no-repeat`
    : 'radial-gradient(ellipse 50% 30% at 100% 0%, rgba(218,201,154,0.22), transparent 60%), radial-gradient(ellipse 40% 25% at 0% 100%, rgba(218,201,154,0.10), transparent 60%), #FBFAF7';

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><style>
${FONT_IMPORT}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html, body { width: 100%; height: 100%; overflow: hidden; }
body{font-family:'Inter',-apple-system,sans-serif;background:#FBFAF7;color:#1A1A1A;-webkit-font-smoothing:antialiased;display:flex}
${SLIDE_CSS}
.card{width:100%;height:100%;aspect-ratio: 4 / 5;padding:5.5% 6%;display:flex;flex-direction:column;position:relative;background:${slideBg};overflow:hidden}
.card::after{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(120,140,180,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(120,140,180,0.05) 1px,transparent 1px);background-size:4% 4%;pointer-events:none;z-index:0}
.card::before{content:"";position:absolute;left:6%;right:6%;top:0;height:2px;background:linear-gradient(90deg,transparent,rgba(218,201,154,0.65) 50%,transparent);z-index:1}
.card>*{position:relative;z-index:1}
.head{display:flex;align-items:center;justify-content:space-between}
.logo-block{display:flex;align-items:center;gap:14px}
.logo-circle{width:clamp(40px,5.2vw,70px);height:clamp(40px,5.2vw,70px);border-radius:50%;background:#fff;box-shadow:0 4px 14px rgba(0,0,0,0.06);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.logo-mark{color:#DAC99A;font-weight:800;font-size:clamp(14px,2vw,24px);letter-spacing:-0.04em}
.logo-name{font-weight:700;font-size:clamp(13px,1.9vw,22px);color:#1A1A1A;line-height:1.1}
.logo-sub{font-weight:500;font-size:clamp(9px,1.1vw,12px);color:rgba(26,26,26,0.5);letter-spacing:0.18em;text-transform:uppercase;margin-top:2px}
.corner-tag{display:inline-flex;align-items:center;gap:8px;background:rgba(218,201,154,0.16);border:1px solid rgba(218,201,154,0.35);border-radius:100px;padding:clamp(6px,1vw,10px) clamp(14px,2vw,22px);font-weight:600;font-size:clamp(11px,1.5vw,16px);color:#BFA96E}
.corner-tag::before{content:"";width:7px;height:7px;border-radius:50%;background:#DAC99A;box-shadow:0 0 8px rgba(218,201,154,0.7)}
.section-label{display:inline-flex;align-items:center;background:rgba(218,201,154,0.18);border:1px solid rgba(218,201,154,0.35);border-radius:100px;padding:clamp(7px,1.1vw,11px) clamp(16px,2.2vw,26px);font-weight:700;font-size:clamp(10px,1.4vw,15px);color:#BFA96E;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:3.5%;box-shadow:0 2px 8px rgba(218,201,154,0.15)}
.page-num{font-weight:700;font-size:clamp(11px,1.6vw,17px);color:rgba(26,26,26,0.5);background:#fff;padding:clamp(8px,1.2vw,12px) clamp(14px,1.8vw,20px);border-radius:100px;box-shadow:0 2px 8px rgba(0,0,0,0.04)}
.baseline{font-weight:400;font-size:clamp(9px,1.3vw,13px);color:rgba(26,26,26,0.4)}
.main-wrap{flex:1;display:flex;flex-direction:column;justify-content:center;margin:3% 0}
</style></head><body>
<div class="card">
<div class="head"><div class="logo-block"><div class="logo-circle"><span class="logo-mark">7</span></div><div><div class="logo-name">Seven At Home</div><div class="logo-sub">Investir avec clarté</div></div></div><span class="corner-tag">${esc(cornerTag)}</span></div>
<div class="main-wrap"><div class="section-label">${esc(sectionLabel)}</div>${layoutBody(slide)}</div>
<div class="head" style="margin-top:auto"><span class="baseline">Contenu informatif — communication pédagogique</span><span class="page-num">${pageNum}</span></div>
</div></body></html>`;

  return opts.export ? toExport(html) : html;
}
