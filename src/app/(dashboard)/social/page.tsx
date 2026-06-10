import { Calendar, Image as ImageIcon, Lightbulb, Radar, Share2, Sparkles } from 'lucide-react';
import Link from 'next/link';

const MODULES = [
  {
    href: '/social/generateur',
    icon: Sparkles,
    title: 'Générateur de posts',
    desc: 'Brain Réseaux : contenu conforme + slides HTML premium (gabarits L1–L7) prêtes pour Figma.',
    live: true,
  },
  {
    href: '/social/ideas',
    icon: Lightbulb,
    title: 'Idées',
    desc: "Génération d'idées via Grok (actu immo + veille + contexte SAH), validation humaine.",
    live: true,
  },
  {
    href: '/social/posts',
    icon: ImageIcon,
    title: 'Posts',
    desc: '3 posts par idée (FB/IG/LinkedIn) + visuels premium SAH, scan AMF, export Figma.',
    live: true,
  },
  {
    href: '/social/competitive',
    icon: Radar,
    title: 'Veille concurrents',
    desc: 'Analyse Grok des concurrents, opportunités SAH, conversion en idées.',
    live: true,
  },
  {
    href: '/social/calendar',
    icon: Calendar,
    title: 'Calendrier & export',
    desc: 'Planning éditorial + notes de contexte + export CSV Metricool.',
    live: true,
  },
];

type SocialModule = (typeof MODULES)[number];

function ModuleCard({ module: m }: { module: SocialModule }) {
  const Icon = m.icon;
  const card = (
    <div className="view-card" style={{ height: '100%', opacity: m.live ? 1 : 0.6 }}>
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'var(--ai-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ai)',
          }}
        >
          <Icon size={18} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>{m.title}</span>
          {!m.live && <span className="badge badge-neutral">bientôt</span>}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{m.desc}</div>
      </div>
    </div>
  );
  if (!m.live) return card;
  return (
    <Link href={m.href} style={{ textDecoration: 'none' }}>
      {card}
    </Link>
  );
}

export default function SocialPage() {
  return (
    <>
      <div>
        <h1 className="page-title">Social Hub</h1>
        <div className="page-desc">
          Production de contenu social SAH : idées, posts, carrousels, veille. Conforme AMF, contenu
          marketing uniquement (aucune donnée investisseur ne sort de l'UE).
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {MODULES.map((m) => (
          <ModuleCard key={m.href} module={m} />
        ))}
      </div>

      <div className="alert alert-info">
        <span className="alert-icon">
          <Share2 size={16} />
        </span>
        <div className="alert-body">
          <div className="alert-title">Conformité</div>
          <div className="alert-description">
            Tout contenu sortant est scanné AMF (termes interdits bloqués, dont « crowdfunding » que
            SAH n'a pas le droit d'employer). La génération IA passe par OpenRouter avec une
            barrière anti-PII : aucune donnée personnelle d'investisseur ne transite hors UE.
          </div>
        </div>
      </div>
    </>
  );
}
