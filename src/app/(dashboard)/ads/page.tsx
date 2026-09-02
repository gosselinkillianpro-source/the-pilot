import { AlertTriangle, ArrowRight, CheckCircle2, PlugZap } from 'lucide-react';
import type { ReactNode } from 'react';
import { AdsPeriodFilter } from '@/components/shared/ads-period-filter';
import { type AdsConsoleData, getAdsConsole, type VitalKpi } from '@/lib/ads/console-data';
import type { FunnelStep } from '@/lib/ads/funnel-math';
import { resolveAdsPeriod } from '@/lib/ads/period';
import { getAuthenticatedUser } from '@/lib/auth';
import { countRdvAutoTracked, listAdAttributions } from '@/lib/db/queries/ad-attributions';
import { AdsReco } from './ads-reco';
import { CampaignTable } from './campaign-table';
import { FixedCostsEditor } from './fixed-costs';
import { ManualTracking } from './manual-tracking';

export const dynamic = 'force-dynamic';

/**
 * Console de pilotage Ads — répondre en < 10 s à : est-ce que je gagne de
 * l'argent, qu'est-ce que je scale, qu'est-ce que je coupe, qu'est-ce qui a
 * changé. Du plus décisionnel (bandeau, funnel, table) au plus détaillé
 * (attribution, cohortes, coûts, alertes). Meta uniquement — Google en pause.
 */

function eur(v: number | null, dec = 0): string {
  if (v === null) return '—';
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec })} €`;
}
function int(v: number | null): string {
  if (v === null) return '—';
  return Math.round(v).toLocaleString('fr-FR');
}

/** Libellé avec définition au survol — chaque chiffre dit comment il est calculé. */
function Def({ children, title }: { children: ReactNode; title: string }) {
  return (
    <span
      title={title}
      style={{
        cursor: 'help',
        borderBottom: '1px dotted color-mix(in srgb, var(--text-4) 60%, transparent)',
      }}
    >
      {children}
    </span>
  );
}

function DeltaBadge({
  pct,
  tone = 'up-good',
}: {
  pct: number | null;
  tone?: 'up-good' | 'down-good' | 'neutral';
}) {
  if (pct === null) {
    return (
      <span
        style={{ fontSize: 11, color: 'var(--text-4)' }}
        title="Pas de base de comparaison sur la période précédente."
      >
        — vs préc.
      </span>
    );
  }
  const up = pct > 0;
  let color = 'var(--text-4)';
  if (pct !== 0 && tone !== 'neutral') {
    const good = tone === 'up-good' ? up : !up;
    color = good ? 'var(--success)' : 'var(--danger)';
  }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, whiteSpace: 'nowrap' }}>
      {up ? '+' : ''}
      {pct} % <span style={{ color: 'var(--text-4)', fontWeight: 400 }}>vs préc.</span>
    </span>
  );
}

/* ----------------------------- 2. Bandeau vital ----------------------------- */

function VitalTile({
  label,
  def,
  value,
  kpi,
  tone,
}: {
  label: string;
  def: string;
  value: string;
  kpi: VitalKpi;
  tone: 'up-good' | 'down-good' | 'neutral';
}) {
  return (
    <div
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '12px 16px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        <Def title={def}>{label}</Def>
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          color: 'var(--text-1)',
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
      <DeltaBadge pct={kpi.deltaPct} tone={tone} />
    </div>
  );
}

function VitalBand({ data }: { data: AdsConsoleData }) {
  const v = data.vital;
  const roas = v.roas.current;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 10,
      }}
    >
      <VitalTile
        label="Dépense média"
        def="Dépense Meta sur la période sélectionnée (API Meta, niveau compte). Coûts fixes exclus."
        value={eur(v.spend.current)}
        kpi={v.spend}
        tone="neutral"
      />
      <VitalTile
        label="Revenu attribué"
        def="€ de souscriptions signées DANS la période par des personnes attribuées aux ads (code pub, RDV Calendly, ajout manuel). Fenêtre : date de signature — pas de fenêtre de clic, le cycle de vente est long."
        value={eur(v.revenue.current)}
        kpi={v.revenue}
        tone="up-good"
      />
      <div
        style={{
          background:
            roas !== null && roas >= 1
              ? 'color-mix(in srgb, var(--success) 8%, var(--surface-2))'
              : roas !== null
                ? 'color-mix(in srgb, var(--danger) 8%, var(--surface-2))'
                : 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '12px 16px',
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-3)',
            textTransform: 'uppercase',
            letterSpacing: 0.4,
          }}
        >
          <Def title="Revenu attribué ÷ dépense média. > 1 = la pub rapporte plus qu'elle ne coûte (hors coûts fixes — voir ROI complet plus bas).">
            ROAS média
          </Def>
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            lineHeight: 1.2,
            color: roas === null ? 'var(--text-1)' : roas >= 1 ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {roas === null ? '—' : `×${roas.toFixed(2)}`}
        </div>
        <DeltaBadge pct={v.roas.deltaPct} tone="up-good" />
      </div>
      <VitalTile
        label="Leads"
        def="Inscrits SAH créés dans la période et attribués aux ads (code pub, RDV Calendly, manuel). Pas les leads pixel."
        value={int(v.leads.current)}
        kpi={v.leads}
        tone="up-good"
      />
    </div>
  );
}

/* ----------------------------- 3. Funnel ----------------------------- */

const STEP_DEFS: Record<string, string> = {
  impressions: 'Impressions Meta sur la période (API, niveau compte).',
  clicks: 'Clics Meta sur la période.',
  leads:
    'Inscrits SAH de la période attribués aux ads (code pub, RDV Calendly, manuel). Taux = leads ÷ clics.',
  rdvPris:
    'Fiches RDV Calendly créées dans la période. Limite assumée : une fiche naît à la première ouverture de la page RDV qui voit le rendez-vous.',
  rdvHonores:
    "Fiches RDV de la période dont l'étape À DATE a dépassé « pris en charge » (un RDV honoré passe la fiche à « appelé »). Pas de date d'honoré persistée.",
  closes: 'Investisseurs attribués ads ayant signé une souscription dans la période.',
  revenue: '€ signés dans la période par les personnes attribuées ads.',
};

function FunnelStripStep({ step, worst }: { step: FunnelStep; worst: boolean }) {
  return (
    <div
      style={{
        flex: '1 1 110px',
        minWidth: 104,
        background: worst
          ? 'color-mix(in srgb, var(--danger) 7%, var(--surface-2))'
          : 'var(--surface-2)',
        border: worst
          ? '1px solid color-mix(in srgb, var(--danger) 45%, transparent)'
          : '1px solid var(--border)',
        borderRadius: 10,
        padding: '10px 12px',
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          letterSpacing: 0.3,
          whiteSpace: 'nowrap',
        }}
      >
        <Def title={STEP_DEFS[step.key] ?? step.label}>{step.label}</Def>
        {worst ? (
          <span
            title="Étape dont le taux de conversion s'est le plus dégradé vs période précédente."
            style={{ color: 'var(--danger)', marginLeft: 5, cursor: 'help' }}
          >
            ▼
          </span>
        ) : null}
      </div>
      <div
        style={{
          fontSize: 19,
          fontWeight: 800,
          fontFamily: 'var(--font-mono)',
          color: step.value === null ? 'var(--text-4)' : 'var(--text-1)',
          lineHeight: 1.25,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {step.value === null ? 'non tracké' : step.isEuro ? eur(step.value) : int(step.value)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 3 }}>
        {step.conv !== null ? (
          <span style={{ fontSize: 11, color: worst ? 'var(--danger)' : 'var(--text-3)' }}>
            {step.conv >= 10 ? step.conv.toFixed(0) : step.conv.toFixed(2)} %
            {step.convDeltaPct !== null ? (
              <span
                style={{
                  marginLeft: 4,
                  color:
                    step.convDeltaPct < 0
                      ? 'var(--danger)'
                      : step.convDeltaPct > 0
                        ? 'var(--success)'
                        : 'var(--text-4)',
                }}
              >
                ({step.convDeltaPct > 0 ? '+' : ''}
                {step.convDeltaPct} %)
              </span>
            ) : null}
          </span>
        ) : step.value !== null && step.key !== 'impressions' ? (
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>taux n/d</span>
        ) : null}
        {step.unitCost !== null ? (
          <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>
            <Def
              title={`${step.unitCostLabel} = dépense média de la période ÷ ${step.label.toLowerCase()}.`}
            >
              {step.unitCostLabel} {eur(step.unitCost, step.unitCost < 100 ? 2 : 0)}
            </Def>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function FunnelStrip({ data }: { data: AdsConsoleData }) {
  const { steps, worstKey } = data.funnel;
  return (
    <div className="view-card">
      <div className="view-card-body" style={{ padding: '12px 14px' }}>
        <div
          style={{ display: 'flex', alignItems: 'stretch', gap: 6, overflowX: 'auto' }}
          className="table-scroll"
        >
          {steps.map((s, i) => (
            <div key={s.key} style={{ display: 'contents' }}>
              {i > 0 ? (
                <span
                  style={{
                    alignSelf: 'center',
                    color: 'var(--text-4)',
                    flexShrink: 0,
                    display: 'flex',
                  }}
                >
                  <ArrowRight size={13} />
                </span>
              ) : null}
              <FunnelStripStep step={s} worst={worstKey === s.key} />
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 8, lineHeight: 1.5 }}>
          Sous chaque étape : taux vs étape précédente (variation vs période précédente entre
          parenthèses) et coût unitaire. ▼ = l'étape qui s'est le plus dégradée. Le funnel peut
          dépasser 100 % : on peut prendre RDV sans être encore inscrit SAH.
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- 5. Attribution honnête ----------------------------- */

function AttributionBlock({ data }: { data: AdsConsoleData }) {
  const { levels, totalSah } = data.attribution;
  const LEVEL_COLOR: Record<string, string> = {
    certain: 'var(--success)',
    probable: 'var(--warning)',
    non_attribue: 'var(--text-4)',
  };
  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title">Attribution honnête</div>
        <span style={{ fontSize: 12, color: 'var(--text-4)' }}>
          total SAH période : {eur(totalSah.collecte)}
        </span>
      </div>
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--text-2)',
            lineHeight: 1.55,
            padding: '8px 10px',
            borderRadius: 8,
            background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)',
          }}
        >
          <strong>Règle unique</strong> : une personne est attribuée aux ads si elle a saisi un code
          pub à l'inscription ou été rattachée à la main (<strong>certain</strong>), ou pris un RDV
          Calendly sans qu'aucun autre canal ne la revendique (<strong>probable</strong>).{' '}
          <strong>Fenêtre</strong> : souscriptions signées dans la période, sans fenêtre de clic
          (cycle de vente long). Un euro n'appartient qu'à un seul niveau — le non-attribué n'est
          jamais masqué ni réparti.
        </div>
        <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                {['Niveau', 'Inscrits', 'Investisseurs', 'Collecte', '% du total'].map((h, idx) => (
                  <th
                    key={h}
                    style={{
                      textAlign: idx === 0 ? 'left' : 'right',
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: 'var(--text-3)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.3,
                      padding: '6px 10px',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => {
                const share =
                  totalSah.collecte > 0 ? (l.counts.collecte / totalSah.collecte) * 100 : null;
                return (
                  <tr key={l.key}>
                    <td
                      style={{
                        padding: '8px 10px',
                        borderBottom:
                          '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--text-1)',
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: LEVEL_COLOR[l.key],
                          }}
                        />
                        <Def title={l.detail}>{l.label}</Def>
                      </span>
                    </td>
                    {[
                      { k: 'inscrits', v: int(l.counts.inscrits) },
                      { k: 'investisseurs', v: int(l.counts.investisseurs) },
                      { k: 'collecte', v: eur(l.counts.collecte), bold: true },
                      { k: 'part', v: share === null ? '—' : `${share.toFixed(0)} %` },
                    ].map((cell) => (
                      <td
                        key={`${l.key}-${cell.k}`}
                        style={{
                          textAlign: 'right',
                          fontSize: 13,
                          fontFamily: 'var(--font-mono)',
                          fontWeight: cell.bold ? 600 : 400,
                          color: 'var(--text-1)',
                          padding: '8px 10px',
                          borderBottom:
                            '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
                        }}
                      >
                        {cell.v}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- 6. Cohortes ----------------------------- */

function CohortBlock({ data }: { data: AdsConsoleData }) {
  const rows = data.cohorts;
  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title">
          <Def title="Rentabilité par MOIS DE CRÉATION du lead (pas par mois d'encaissement) : les leads attribués ads de chaque mois, leur coût (dépense Meta du mois), et ce qu'ils ont rapporté À DATE — la vue de vérité pour un cycle de vente long.">
            Cohortes — par mois de génération du lead
          </Def>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-4)' }}>6 derniers mois · à date</span>
      </div>
      <div className="view-card-body">
        {rows.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            Aucun lead attribué ads sur les 6 derniers mois.
          </div>
        ) : (
          <div className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead>
                <tr>
                  {[
                    { h: 'Mois', left: true, def: 'Mois de création du compte SAH (cohorte).' },
                    { h: 'Leads', def: 'Inscrits attribués ads créés ce mois.' },
                    { h: 'Complets', def: 'Dont profil + KYC terminés, à date.' },
                    { h: 'Investisseurs', def: 'Dont au moins une souscription signée, à date.' },
                    { h: 'Dépense du mois', def: 'Dépense média Meta du mois calendaire.' },
                    {
                      h: 'Collecte à date',
                      def: 'Tout ce que ces leads ont signé depuis, quelle que soit la date.',
                    },
                    {
                      h: 'Ratio',
                      def: 'Collecte à date ÷ dépense du mois. Une cohorte récente est mécaniquement partielle.',
                    },
                  ].map((c) => (
                    <th
                      key={c.h}
                      style={{
                        textAlign: c.left ? 'left' : 'right',
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: 'var(--text-3)',
                        textTransform: 'uppercase',
                        letterSpacing: 0.3,
                        padding: '6px 10px',
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                        cursor: 'help',
                      }}
                      title={c.def}
                    >
                      {c.h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cells: { k: string; v: string; color?: string; bold?: boolean }[] = [
                    { k: 'leads', v: int(r.leads) },
                    { k: 'complets', v: int(r.complets) },
                    { k: 'investisseurs', v: int(r.investisseurs) },
                    { k: 'depense', v: r.spend === null ? 'non dispo' : eur(r.spend) },
                    {
                      k: 'collecte',
                      v: eur(r.collecte),
                      bold: true,
                      color: r.collecte > 0 ? 'var(--success)' : undefined,
                    },
                    {
                      k: 'ratio',
                      v: r.ratio === null ? '—' : `×${r.ratio.toFixed(1)}`,
                      bold: true,
                      color:
                        r.ratio === null
                          ? undefined
                          : r.ratio >= 1
                            ? 'var(--success)'
                            : 'var(--danger)',
                    },
                  ];
                  return (
                    <tr key={r.month}>
                      <td
                        style={{
                          fontSize: 13,
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          color: 'var(--text-1)',
                          padding: '8px 10px',
                          borderBottom:
                            '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
                        }}
                      >
                        {r.month}
                      </td>
                      {cells.map((c) => (
                        <td
                          key={`${r.month}-${c.k}`}
                          style={{
                            textAlign: 'right',
                            fontSize: 13,
                            fontFamily: 'var(--font-mono)',
                            fontWeight: c.bold ? 600 : 400,
                            color: c.color ?? 'var(--text-1)',
                            padding: '8px 10px',
                            borderBottom:
                              '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.v}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- 8. Alertes ----------------------------- */

function AlertsBlock({ data }: { data: AdsConsoleData }) {
  const alerts = data.alerts;
  return (
    <div className="view-card">
      <div className="view-card-header">
        <div className="view-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={15} />
          <Def title="Détection automatique de ruptures : CPL pixel +30 % (3 derniers jours vs 3 précédents), campagne active qui dépense sans lead depuis 48 h, taux de show en chute de 20 % vs période précédente.">
            Ruptures de tendance
          </Def>
        </div>
        <span className={`badge ${alerts.length > 0 ? 'badge-warning' : 'badge-neutral'}`}>
          {alerts.length}
        </span>
      </div>
      <div className="view-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {alerts.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            Rien à signaler : pas de rupture détectée sur la période.
          </div>
        ) : (
          alerts.map((a) => {
            const color = a.level === 'danger' ? 'var(--danger)' : 'var(--warning)';
            const body = (
              <>
                <span style={{ color, display: 'flex', marginTop: 1 }}>
                  <AlertTriangle size={14} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                    {a.title}
                    {a.campaignId ? (
                      <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 6 }}>
                        → voir la campagne
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{a.detail}</div>
                </div>
              </>
            );
            const style = {
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start' as const,
              padding: '8px 10px',
              borderRadius: 8,
              background: `color-mix(in srgb, ${color} 8%, transparent)`,
              border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
              textDecoration: 'none',
            };
            return a.campaignId ? (
              <a key={`${a.title}|${a.detail}`} href={`#camp-${a.campaignId}`} style={style}>
                {body}
              </a>
            ) : (
              <div key={`${a.title}|${a.detail}`} style={style}>
                {body}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Page ----------------------------- */

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const user = await getAuthenticatedUser();
  const sp = await searchParams;
  const period = resolveAdsPeriod(sp);
  const canManage = user.role === 'admin' || user.role === 'executive';

  const [data, attributions, rdvAutoCount] = await Promise.all([
    getAdsConsole(period),
    canManage ? listAdAttributions() : Promise.resolve([]),
    canManage ? countRdvAutoTracked() : Promise.resolve(0),
  ]);

  return (
    <>
      {/* 1. Période + état des sources */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 className="page-title">Ads Control</h1>
          <div
            className="page-desc"
            style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
          >
            <span>
              Meta · {period.label} <span style={{ color: 'var(--text-4)' }}>vs période préc.</span>
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                color: data.meta.ok ? 'var(--success)' : 'var(--danger)',
              }}
              title={
                data.meta.ok
                  ? 'API Meta connectée — chiffres média en direct.'
                  : `Meta indisponible : ${data.meta.reason ?? 'erreur'} — les blocs média affichent « non tracké ».`
              }
            >
              {data.meta.ok ? <CheckCircle2 size={13} /> : <PlugZap size={13} />}
              {data.meta.ok ? 'Meta connecté' : 'Meta indisponible'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-4)' }}>Google : en pause</span>
          </div>
        </div>
        <AdsPeriodFilter />
      </div>

      {/* 2. Bandeau vital */}
      <VitalBand data={data} />

      {/* 3. Funnel */}
      <FunnelStrip data={data} />

      {/* 4. Table campagnes */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Campagnes ({data.campaigns.length})</div>
          <span style={{ fontSize: 12, color: 'var(--text-4)' }}>
            tri par défaut : dépense décroissante
          </span>
        </div>
        <div className="view-card-body">
          <CampaignTable rows={data.campaigns} />
        </div>
      </div>

      {/* 5. Attribution honnête */}
      <AttributionBlock data={data} />

      {/* 6. Cohortes */}
      <CohortBlock data={data} />

      {/* 7. Coûts fixes & ROI complet */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">
            <Def title="Le ROAS média ne contient QUE la dépense pub. Les coûts fixes (outils, créa, prestataires) sont saisis ici, par mois, et servent uniquement au ROI complet — jamais mélangés dans un même ratio.">
              Coûts fixes & ROI complet
            </Def>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-4)' }}>
            {eur(data.costs.totalForPeriod)} de fixes sur la période
          </span>
        </div>
        <div
          className="view-card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div
              style={{
                flex: '1 1 180px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 14px',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase' }}>
                <Def title="Revenu attribué ÷ dépense média seule.">ROAS média</Def>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                {data.costs.roasMedia === null ? '—' : `×${data.costs.roasMedia.toFixed(2)}`}
              </div>
            </div>
            <div
              style={{
                flex: '1 1 180px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 14px',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase' }}>
                <Def title="Revenu attribué ÷ (dépense média + coûts fixes des mois calendaires couverts par la période — un mois entamé compte en entier).">
                  ROI complet
                </Def>
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  color:
                    data.costs.roiComplet === null
                      ? 'var(--text-1)'
                      : data.costs.roiComplet >= 1
                        ? 'var(--success)'
                        : 'var(--danger)',
                }}
              >
                {data.costs.roiComplet === null ? '—' : `×${data.costs.roiComplet.toFixed(2)}`}
              </div>
            </div>
          </div>
          <FixedCostsEditor rows={data.costs.list} canEdit={canManage} />
        </div>
      </div>

      {/* 8. Alertes */}
      <AlertsBlock data={data} />

      {/* Outils : tracking manuel + analyse IA */}
      {canManage && <ManualTracking rows={attributions} rdvAutoCount={rdvAutoCount} />}
      {canManage && data.campaigns.length > 0 && <AdsReco />}
    </>
  );
}
