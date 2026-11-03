import { Building2, Layers } from 'lucide-react';
import Link from 'next/link';
import { DOSSIERS, MONTANTS, PROCESSING, PROCESSING_CODES } from '@/lib/club-deal/constants';
import type { ClubDealStats, ProjectStats } from '@/lib/club-deal/stats';
import { STATUS_TONE } from './tones';
import { money } from './ui';

/** Synthèse en haut de l'écran Club deal : chiffres clés, projets, tranches. */

export const SECTION_TITLE = {
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--text-3)',
  margin: '0 0 10px',
} as const;

function Kpi({
  label,
  value,
  sub,
  tone,
  compact = false,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  /** Valeur longue (fourchette) : taille réduite pour tenir sur une ligne. */
  compact?: boolean;
}) {
  return (
    <div className="kpi-hero">
      <div className="kpi-hero-label">{label}</div>
      <div
        className="kpi-hero-value"
        style={{
          ...(tone ? { color: tone } : {}),
          ...(compact ? { fontSize: 'clamp(20px, 2.2vw, 26px)', whiteSpace: 'nowrap' } : {}),
        }}
      >
        {value}
      </div>
      {sub && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-3)' }}>{sub}</div>}
    </div>
  );
}

function potentialText(p: ClubDealStats['potential']): string {
  if (p.min === 0 && p.max === 0) return '—';
  return p.max === null ? `≥ ${money(p.min)}` : `${money(p.min)} – ${money(p.max)}`;
}

export function KpiRow({ stats }: { stats: ClubDealStats }) {
  const conversion = stats.investors ? Math.round((stats.subscribed / stats.investors) * 100) : 0;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Kpi
        label="Intentions"
        value={String(stats.total)}
        sub={
          stats.duplicates ? `dont ${stats.duplicates} doublon(s) possible(s)` : 'demandes reçues'
        }
      />
      <Kpi
        label="À traiter"
        value={String(stats.toProcess)}
        tone={stats.toProcess > 0 ? 'var(--brand)' : undefined}
        sub="statut « Nouveau »"
      />
      <Kpi
        label="Investisseurs"
        value={String(stats.investors)}
        sub={`${stats.subscribed} ont souscrit (${conversion} %) · ${stats.withCallConsent} d'accord pour un appel`}
      />
      <Kpi
        label="Potentiel déclaré"
        value={potentialText(stats.potential)}
        compact
        sub={
          stats.potential.undisclosed
            ? `fourchette des tranches · ${stats.potential.undisclosed} sans montant`
            : 'fourchette des tranches'
        }
      />
    </div>
  );
}

/** Barre empilée : répartition des demandes par statut de traitement. */
function StatusBar({ byStatus, total }: { byStatus: ProjectStats['byStatus']; total: number }) {
  if (!total) return <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-3)' }} />;
  return (
    <div
      role="img"
      aria-label={PROCESSING_CODES.map((c) => `${PROCESSING[c]} : ${byStatus[c]}`).join(', ')}
      style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1 }}
    >
      {PROCESSING_CODES.filter((c) => byStatus[c] > 0).map((c) => (
        <span
          key={c}
          title={`${PROCESSING[c]} : ${byStatus[c]}`}
          style={{ flex: byStatus[c], background: STATUS_TONE[c].solid }}
        />
      ))}
    </div>
  );
}

function ProjectCard({ p }: { p: ProjectStats }) {
  const [place, kind] = DOSSIERS[p.code].split(' · ');
  return (
    <div className="view-card">
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>{place}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{kind}</div>
          </div>
          <Building2 size={16} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>
            {p.investors}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            investisseur{p.investors > 1 ? 's' : ''} intéressé{p.investors > 1 ? 's' : ''}
          </span>
        </div>
        <StatusBar byStatus={p.byStatus} total={p.intentions} />
        <div
          style={{
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap',
            fontSize: 12,
            color: 'var(--text-3)',
          }}
        >
          <span>
            <strong style={{ color: 'var(--text-1)' }}>{p.intentions}</strong> intention
            {p.intentions > 1 ? 's' : ''}
          </span>
          <span>
            <strong style={{ color: p.toProcess ? 'var(--brand)' : 'var(--text-1)' }}>
              {p.toProcess}
            </strong>{' '}
            à traiter
          </span>
          <span>
            <strong style={{ color: p.subscribed ? 'var(--success)' : 'var(--text-1)' }}>
              {p.subscribed}
            </strong>{' '}
            souscrit{p.subscribed > 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ProjectsGrid({ stats }: { stats: ClubDealStats }) {
  return (
    <section aria-labelledby="cd-projects">
      <h2 id="cd-projects" style={SECTION_TITLE}>
        Projets
      </h2>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        {stats.projects.map((p) => (
          <ProjectCard key={p.code} p={p} />
        ))}
      </div>
    </section>
  );
}

export function TranchesCard({ stats }: { stats: ClubDealStats }) {
  const max = Math.max(1, ...stats.tranches.map((t) => t.investors));
  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Layers size={15} />
          Montants envisagés
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-4)' }}>investisseurs distincts</span>
      </div>
      <div className="view-card-body grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-2.5">
        {stats.tranches.map((t) => (
          <div key={t.code} style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
            <span
              style={{
                flex: '0 0 124px',
                fontSize: 12,
                color: 'var(--text-2)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {t.code === 'nsp' ? 'À discuter' : MONTANTS[t.code]}
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                height: 8,
                borderRadius: 4,
                background: 'var(--surface-3)',
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${(t.investors / max) * 100}%`,
                  background: t.code === 'nsp' ? 'var(--text-4)' : 'var(--brand)',
                  borderRadius: 4,
                }}
              />
            </span>
            <span
              style={{
                flex: '0 0 24px',
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'right',
                color: 'var(--text-1)',
              }}
            >
              {t.investors}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Puces de filtre par statut (URL = état : partageable, retour arrière OK). */
export function StatusChips({
  stats,
  current,
  q,
}: {
  stats: ClubDealStats;
  current: string | null;
  q: string;
}) {
  const href = (status: string | null) => {
    const sp = new URLSearchParams();
    if (status) sp.set('status', status);
    if (q) sp.set('q', q);
    const s = sp.toString();
    return s ? `/club-deal?${s}#liste` : '/club-deal#liste';
  };
  const chips: { code: string | null; label: string; count: number }[] = [
    { code: null, label: 'Toutes', count: stats.total },
    ...PROCESSING_CODES.map((c) => ({ code: c, label: PROCESSING[c], count: stats.byStatus[c] })),
  ];
  return (
    <nav
      aria-label="Filtrer par statut"
      style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}
    >
      {chips.map((c) => {
        const active = (current ?? null) === c.code;
        return (
          <Link
            key={c.code ?? 'all'}
            href={href(c.code)}
            aria-current={active ? 'page' : undefined}
            className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {c.label}
            <span style={{ opacity: 0.7, fontWeight: 500 }}>{c.count}</span>
          </Link>
        );
      })}
    </nav>
  );
}
