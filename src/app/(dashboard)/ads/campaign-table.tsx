'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Sparkline } from '@/components/shared/sparkline';
import type { ConsoleCampaignRow } from '@/lib/ads/console-data';
import { DECISION_RULES, type DecisionVerdict } from '@/lib/ads/decisions';

/**
 * Table campagnes de la console Ads : tri instantané côté client, drill-down
 * par ligne (métriques de diagnostic), décision calculée par règles explicites.
 *
 * Honnêteté : le revenu SAH est attribué au CANAL, pas à la campagne — donc pas
 * de colonne « revenu / ROAS par campagne » inventée. Le CPL affiché ici est le
 * CPL PIXEL : il sert à comparer les campagnes entre elles.
 */

function eur(v: number | null, dec = 0): string {
  if (v === null) return '—';
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec })} €`;
}
function int(v: number): string {
  return Math.round(v).toLocaleString('fr-FR');
}

const VERDICT_STYLE: Record<DecisionVerdict, { label: string; color: string }> = {
  scale: { label: 'Scale', color: 'var(--success)' },
  garder: { label: 'Garder', color: 'var(--text-3)' },
  reduire: { label: 'Réduire', color: 'var(--warning)' },
  couper: { label: 'Couper', color: 'var(--danger)' },
  observer: { label: 'Observer', color: 'var(--text-4)' },
};

type SortKey = 'spend' | 'results' | 'cpl' | 'name';

const SORTS: Record<SortKey, (a: ConsoleCampaignRow, b: ConsoleCampaignRow) => number> = {
  spend: (a, b) => b.spend - a.spend,
  results: (a, b) => b.results - a.results,
  cpl: (a, b) => (a.cpl ?? Number.POSITIVE_INFINITY) - (b.cpl ?? Number.POSITIVE_INFINITY),
  name: (a, b) => a.name.localeCompare(b.name),
};

function Th({
  children,
  left,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  left?: boolean;
  onClick?: () => void;
  active?: boolean;
  title?: string;
}) {
  return (
    <th
      onClick={onClick}
      title={title}
      style={{
        textAlign: left ? 'left' : 'right',
        fontSize: 10.5,
        fontWeight: 600,
        color: active ? 'var(--text-1)' : 'var(--text-3)',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        padding: '6px 10px',
        borderBottom: '1px solid var(--border)',
        whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : title ? 'help' : undefined,
        userSelect: 'none',
      }}
    >
      {children}
      {active ? ' ↓' : ''}
    </th>
  );
}

function Td({
  children,
  left,
  color,
  bold,
}: {
  children: React.ReactNode;
  left?: boolean;
  color?: string;
  bold?: boolean;
}) {
  return (
    <td
      style={{
        textAlign: left ? 'left' : 'right',
        fontSize: 13,
        fontFamily: left ? 'inherit' : 'var(--font-mono)',
        color: color ?? 'var(--text-1)',
        fontWeight: bold ? 600 : 400,
        padding: '8px 10px',
        borderBottom: '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}

function DiagCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-4)', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
        {value}
      </div>
    </div>
  );
}

export function CampaignTable({ rows }: { rows: ConsoleCampaignRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [open, setOpen] = useState<string | null>(null);

  const sorted = useMemo(() => [...rows].sort(SORTS[sortKey]), [rows, sortKey]);

  if (rows.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '8px 2px' }}>
        Aucune campagne sur la période (ou Meta indisponible — voir l'état de connexion en haut de
        page).
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="table-scroll">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <Th left onClick={() => setSortKey('name')} active={sortKey === 'name'}>
                Campagne
              </Th>
              <Th
                onClick={() => setSortKey('spend')}
                active={sortKey === 'spend'}
                title="Dépense média Meta sur la période sélectionnée."
              >
                Dépense
              </Th>
              <Th
                onClick={() => setSortKey('results')}
                active={sortKey === 'results'}
                title="Leads déclarés par le pixel Meta sur la période. Sert à comparer les campagnes entre elles — le volume réel se lit dans le funnel (inscrits SAH)."
              >
                Leads (pixel)
              </Th>
              <Th
                onClick={() => setSortKey('cpl')}
                active={sortKey === 'cpl'}
                title="Dépense ÷ leads pixel. Comparaison entre campagnes uniquement, pas un coût réel."
              >
                CPL
              </Th>
              <Th title="Dépense par jour sur les 7 derniers jours de la période.">7 jours</Th>
              <Th
                left
                title={`Règles explicites : en pause ou < ${DECISION_RULES.minSpendForJudgment} € → Observer · ${DECISION_RULES.wasteDays} j de dépense sans lead ou CPL > ${DECISION_RULES.cutCplFactor}× médiane → Couper · CPL > ${DECISION_RULES.reduceCplFactor}× médiane → Réduire · CPL < ${Math.round(DECISION_RULES.scaleCplFactor * 100)} % de la médiane et ≥ ${DECISION_RULES.scaleMinResults} leads → Scale. Survole un verdict pour la raison exacte.`}
              >
                Décision
              </Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const v = VERDICT_STYLE[c.decision.verdict];
              const isOpen = open === c.id;
              return (
                <Fragment key={c.id}>
                  <tr
                    id={`camp-${c.id}`}
                    onClick={() => setOpen(isOpen ? null : c.id)}
                    style={{ cursor: 'pointer', scrollMarginTop: 80 }}
                  >
                    <Td left bold>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <span
                          style={{
                            maxWidth: 260,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: 'inline-block',
                            verticalAlign: 'bottom',
                          }}
                        >
                          {c.name}
                        </span>
                        {c.status === 'paused' ? (
                          <span className="badge badge-neutral">pause</span>
                        ) : null}
                      </span>
                    </Td>
                    <Td bold>{eur(c.spend)}</Td>
                    <Td>{int(c.results)}</Td>
                    <Td>{eur(c.cpl, 2)}</Td>
                    <Td>
                      {c.spark.length > 1 ? (
                        <Sparkline values={c.spark} width={90} height={24} />
                      ) : (
                        <span style={{ color: 'var(--text-4)' }}>—</span>
                      )}
                    </Td>
                    <Td left>
                      <span
                        title={c.decision.reason}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: v.color,
                          cursor: 'help',
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: v.color,
                          }}
                        />
                        {v.label}
                      </span>
                    </Td>
                  </tr>
                  {isOpen ? (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          padding: '10px 14px 14px 30px',
                          background: 'color-mix(in srgb, var(--surface-2) 60%, transparent)',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            gap: 18,
                            flexWrap: 'wrap',
                            alignItems: 'flex-end',
                          }}
                        >
                          <DiagCell label="Impressions" value={int(c.diag.impressions)} />
                          <DiagCell label="Clics" value={int(c.diag.clicks)} />
                          <DiagCell
                            label="CTR"
                            value={c.diag.ctr === null ? '—' : `${c.diag.ctr.toFixed(2)} %`}
                          />
                          <DiagCell label="CPC" value={eur(c.diag.cpc, 2)} />
                          <DiagCell label="CPM" value={eur(c.diag.cpm, 2)} />
                          <DiagCell
                            label="Fréquence"
                            value={c.diag.frequency === null ? '—' : c.diag.frequency.toFixed(2)}
                          />
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 10 }}>
                          Raison du verdict : {c.decision.reason} · Le détail adsets / créas se gère
                          dans Meta Ads Manager (non répliqué ici pour l'instant).
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-4)', lineHeight: 1.5 }}>
        Pas de colonne « revenu par campagne » : SAH attribue le revenu au canal (code, RDV,
        manuel), pas à la campagne — l'inventer serait faux. La rentabilité se lit dans le bandeau
        vital et l'attribution honnête. Clic sur une ligne = diagnostic ; clic sur un en-tête = tri.
      </div>
    </div>
  );
}
