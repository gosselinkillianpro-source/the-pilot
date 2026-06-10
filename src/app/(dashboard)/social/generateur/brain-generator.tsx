'use client';

import { Copy, Download, Sparkles } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import { type BrainPostResult, generateBrainPostAction } from './actions';

const OBJECTIFS = ['Auto', 'ÉDUQUER', 'PROUVER', 'CONVERTIR'];
const CIBLES = ['Auto', 'A (épargnant)', 'B (investisseur)'];

function downloadHtml(filename: string, html: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'slide.html';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function BrainGenerator() {
  const { toast, runWithActivity } = useToast();
  const [pending, startTransition] = useTransition();
  const [brief, setBrief] = useState('');
  const [objectif, setObjectif] = useState('Auto');
  const [cible, setCible] = useState('Auto');
  const [res, setRes] = useState<BrainPostResult | null>(null);

  function generate() {
    if (brief.trim().length < 5) {
      toast('Décris le sujet du post (au moins 5 caractères).', { variant: 'info' });
      return;
    }
    startTransition(async () => {
      const r = await runWithActivity('Le Brain rédige le post (contenu + slides HTML)…', () =>
        generateBrainPostAction({
          brief: brief.trim(),
          objectif: objectif === 'Auto' ? undefined : objectif,
          cible: cible === 'Auto' ? undefined : cible[0],
        }),
      );
      setRes(r);
      if (!r.ok) toast(r.message, { variant: 'error' });
      else toast(`${r.slides.length} slides générées.`, { variant: 'success' });
    });
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast(`${label} copié.`, { variant: 'success', duration: 2500 }),
      () => toast('Copie impossible (autorise le presse-papier).', { variant: 'error' }),
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Formulaire */}
      <div className="view-card">
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ai)' }}
          >
            <Sparkles size={16} />
            Brain Réseaux — générer un post (slides HTML pour Figma)
          </div>
        </div>
        <div
          className="view-card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <textarea
            className="input"
            rows={3}
            value={brief}
            placeholder="Sujet du post. Ex. « Expliquer pourquoi 15 % cible n'est pas 15 % garanti » ou « Présenter le projet Montbonnot »"
            onChange={(e) => setBrief(e.target.value)}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Objectif</span>
              <select
                className="input"
                value={objectif}
                onChange={(e) => setObjectif(e.target.value)}
              >
                {OBJECTIFS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Cible</span>
              <select className="input" value={cible} onChange={(e) => setCible(e.target.value)}>
                {CIBLES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="btn btn-ai"
            onClick={generate}
            disabled={pending}
            style={{ alignSelf: 'flex-start' }}
          >
            <Sparkles size={14} />
            {pending ? 'Génération…' : 'Générer le post'}
          </button>
          <p style={{ fontSize: 11, color: 'var(--text-4)', margin: 0 }}>
            Chiffres uniquement issus de la fiche faits + des données SAH réelles (jamais inventés).
            Les slides s'importent dans Figma via le plugin « HTML to Design ».
          </p>
        </div>
      </div>

      {res?.ok && (
        <>
          {/* Cadrage + process */}
          <div className="view-card">
            <div className="view-card-header">
              <div className="view-card-title">Cadrage</div>
              <span className="badge badge-neutral">
                {res.objectif} · {res.cible} · {res.pilier}
              </span>
            </div>
            <div
              className="view-card-body"
              style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}
            >
              <div style={{ color: 'var(--text-2)' }}>{res.cadrage}</div>
              {res.hookRetenu ? (
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-4)' }}>Hook retenu</span>
                  <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{res.hookRetenu}</div>
                </div>
              ) : null}
              {res.planJustification ? (
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{res.planJustification}</div>
              ) : null}
              {res.flags.length > 0 && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--warning)',
                    background: 'color-mix(in srgb, var(--warning) 8%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--warning) 24%, transparent)',
                    borderRadius: 8,
                    padding: '8px 10px',
                  }}
                >
                  ⚠️ À vérifier avant publication : {res.flags.join(' · ')}
                </div>
              )}
              {!res.amf.compliant && res.amf.issues.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--danger)' }}>
                  Vérification AMF : termes à contrôler —{' '}
                  {res.amf.issues.map((i) => i.match).join(', ')}. (« non garanti » peut être un
                  faux positif.)
                </div>
              )}
            </div>
          </div>

          {/* Slides */}
          <div className="view-card">
            <div className="view-card-header">
              <div className="view-card-title">Slides ({res.slides.length})</div>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  for (const s of res.slides) downloadHtml(s.file, s.html);
                }}
              >
                <Download size={13} />
                Tout télécharger
              </button>
            </div>
            <div className="view-card-body">
              <div className="cards-grid" style={{ gap: 16 }}>
                {res.slides.map((s, i) => (
                  <div
                    key={s.file || i}
                    style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}
                  >
                    <div
                      style={{
                        width: 248,
                        height: 310,
                        maxWidth: '100%',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        overflow: 'hidden',
                        background: '#FBFAF7',
                      }}
                    >
                      <iframe
                        title={s.file || `slide-${i + 1}`}
                        srcDoc={s.html}
                        scrolling="no"
                        sandbox=""
                        style={{
                          width: 1080,
                          height: 1350,
                          border: 0,
                          transform: 'scale(0.2296)',
                          transformOrigin: 'top left',
                          pointerEvents: 'none',
                        }}
                      />
                    </div>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
                    >
                      <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                        {s.layout || `S${i + 1}`}
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => copy(s.html, 'HTML de la slide')}
                      >
                        <Copy size={12} />
                        Copier
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => downloadHtml(s.file || `slide-${i + 1}.html`, s.html)}
                      >
                        <Download size={12} />
                        .html
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Caption */}
          <div className="view-card">
            <div className="view-card-header">
              <div className="view-card-title">Caption</div>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => copy(res.caption, 'Caption')}
              >
                <Copy size={13} />
                Copier
              </button>
            </div>
            <div className="view-card-body">
              <textarea
                className="input"
                readOnly
                rows={8}
                value={res.caption}
                style={{ resize: 'vertical', fontFamily: 'inherit', width: '100%' }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
