import {
  AlertTriangle,
  CalendarClock,
  CalendarX2,
  CheckCircle2,
  Clock,
  Info,
  RotateCcw,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { getAuthenticatedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * RDV Guillaume — vision agenda Calendly + suivi des leads issus des RDV.
 *
 * ⚠️ MAQUETTE : données d'exemple. Calendly n'est pas encore branché
 * (cf. page « État des sources » → Calendly « non connecté »). Dès que la clé
 * d'accès Calendly de Guillaume est fournie, ces blocs seront alimentés par les
 * vrais RDV (webhook `invitee.created` + sync). La structure DB est déjà prête
 * (pipeline : meeting_booked / meeting_done).
 */

type RdvStatut = 'a_venir' | 'honore' | 'no_show' | 'reporte';
type EtapePipeline =
  | 'RDV pris'
  | 'RDV fait'
  | 'Proposition envoyée'
  | 'Souscrit'
  | 'À relancer'
  | 'Perdu';

interface Rdv {
  id: string;
  lead: string;
  email: string;
  investorId: string | null;
  source: string;
  date: Date;
  statut: RdvStatut;
  etape: EtapePipeline;
  potentielEur: number;
  converti: boolean;
}

// Référentiel maquette — sera remplacé par la sync Calendly.
const RDVS: Rdv[] = [
  {
    id: 'r1',
    lead: 'CamilleFontaine',
    email: 'camille.fontaine@example.com',
    investorId: 'demo-1',
    source: 'Meta Ads — Funnel B',
    date: new Date('2026-06-25T11:00:00+02:00'),
    statut: 'a_venir',
    etape: 'RDV pris',
    potentielEur: 25000,
    converti: false,
  },
  {
    id: 'r2',
    lead: 'Thomas Berger',
    email: 'thomas.berger@example.com',
    investorId: 'demo-2',
    source: 'Google Ads — Search',
    date: new Date('2026-06-25T14:30:00+02:00'),
    statut: 'a_venir',
    etape: 'RDV pris',
    potentielEur: 50000,
    converti: false,
  },
  {
    id: 'r3',
    lead: 'Sophie Marchand',
    email: 'sophie.marchand@example.com',
    investorId: 'demo-3',
    source: 'LinkedIn Ads',
    date: new Date('2026-06-26T10:00:00+02:00'),
    statut: 'a_venir',
    etape: 'RDV pris',
    potentielEur: 15000,
    converti: false,
  },
  {
    id: 'r4',
    lead: 'Nicolas Faure',
    email: 'nicolas.faure@example.com',
    investorId: 'demo-4',
    source: 'Parrainage',
    date: new Date('2026-06-27T16:00:00+02:00'),
    statut: 'a_venir',
    etape: 'RDV pris',
    potentielEur: 30000,
    converti: false,
  },
  {
    id: 'r5',
    lead: 'Élodie Renard',
    email: 'elodie.renard@example.com',
    investorId: 'demo-5',
    source: 'Meta Ads — Funnel B',
    date: new Date('2026-06-23T11:00:00+02:00'),
    statut: 'honore',
    etape: 'Souscrit',
    potentielEur: 40000,
    converti: true,
  },
  {
    id: 'r6',
    lead: 'Maxime Lacroix',
    email: 'maxime.lacroix@example.com',
    investorId: 'demo-6',
    source: 'Google Ads — Search',
    date: new Date('2026-06-23T15:00:00+02:00'),
    statut: 'honore',
    etape: 'Proposition envoyée',
    potentielEur: 20000,
    converti: false,
  },
  {
    id: 'r7',
    lead: 'Julien Petit',
    email: 'julien.petit@example.com',
    investorId: 'demo-7',
    source: 'Meta Ads — Funnel B',
    date: new Date('2026-06-22T10:30:00+02:00'),
    statut: 'no_show',
    etape: 'À relancer',
    potentielEur: 18000,
    converti: false,
  },
  {
    id: 'r8',
    lead: 'Inès Dubois',
    email: 'ines.dubois@example.com',
    investorId: 'demo-8',
    source: 'LinkedIn Ads',
    date: new Date('2026-06-24T17:00:00+02:00'),
    statut: 'reporte',
    etape: 'À relancer',
    potentielEur: 35000,
    converti: false,
  },
];

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

function fmtJour(d: Date): string {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function fmtHeure(d: Date): string {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function statutBadge(s: RdvStatut): { label: string; cls: string } {
  switch (s) {
    case 'a_venir':
      return { label: 'À venir', cls: 'badge-brand' };
    case 'honore':
      return { label: 'Honoré', cls: 'badge-success' };
    case 'no_show':
      return { label: 'No-show', cls: 'badge-danger' };
    case 'reporte':
      return { label: 'Reporté', cls: 'badge-warning' };
  }
}

function etapeBadge(e: EtapePipeline): string {
  if (e === 'Souscrit') return 'badge-success';
  if (e === 'À relancer') return 'badge-warning';
  if (e === 'Perdu') return 'badge-danger';
  return 'badge-neutral';
}

export default async function RdvGuillaumePage() {
  await getAuthenticatedUser();

  const aVenir = RDVS.filter((r) => r.statut === 'a_venir').sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const aRelancer = RDVS.filter((r) => r.statut === 'no_show' || r.statut === 'reporte');

  // KPIs (sur la base maquette).
  const passes = RDVS.filter((r) => r.statut !== 'a_venir');
  const honores = passes.filter((r) => r.statut === 'honore').length;
  const tauxPresence = passes.length > 0 ? Math.round((honores / passes.length) * 100) : 0;
  const noShows = RDVS.filter((r) => r.statut === 'no_show').length;
  const souscrits = RDVS.filter((r) => r.converti).length;
  const tauxConversion = honores > 0 ? Math.round((souscrits / honores) * 100) : 0;

  // Regroupe l'agenda à venir par jour.
  const parJour = new Map<string, Rdv[]>();
  for (const r of aVenir) {
    const key = fmtJour(r.date);
    const arr = parJour.get(key) ?? [];
    arr.push(r);
    parJour.set(key, arr);
  }

  return (
    <>
      {/* En-tête */}
      <div style={{ marginBottom: 16 }}>
        <h1 className="page-title">RDV Guillaume</h1>
        <div className="page-desc">
          Agenda Calendly de Guillaume, suivi des RDV investisseurs (Funnel B) et leads issus des
          rendez-vous.
        </div>
      </div>

      {/* Bandeau maquette */}
      <div
        className="view-card"
        style={{ marginBottom: 16, borderColor: 'var(--warning)', background: 'var(--warning-bg)' }}
      >
        <div
          className="view-card-body"
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 16 }}
        >
          <Info size={18} style={{ color: 'var(--warning-text)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: 'var(--warning-text)' }}>
            <strong>Aperçu — données d'exemple.</strong> Calendly n'est pas encore branché. Pour
            alimenter cette page avec les vrais RDV, il faut la clé d'accès Calendly de Guillaume
            (compte <code>g-gosselin-sevenathome</code>). Voir{' '}
            <Link href="/sources" style={{ color: 'var(--brand)', fontWeight: 600 }}>
              État des sources
            </Link>
            .
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi
          icon={<CalendarClock size={15} />}
          label="RDV à venir"
          value={String(aVenir.length)}
          hint="cette semaine"
        />
        <Kpi
          icon={<CheckCircle2 size={15} />}
          label="Taux de présentation"
          value={`${tauxPresence}%`}
          hint={`${honores}/${passes.length} honorés`}
          tone={tauxPresence >= 70 ? 'success' : 'warning'}
        />
        <Kpi
          icon={<CalendarX2 size={15} />}
          label="No-shows"
          value={String(noShows)}
          hint="à relancer"
          tone={noShows > 0 ? 'danger' : 'neutral'}
        />
        <Kpi
          icon={<TrendingUp size={15} />}
          label="RDV → souscription"
          value={`${tauxConversion}%`}
          hint={`${souscrits} souscription(s)`}
          tone="success"
        />
      </div>

      {/* Agenda à venir */}
      <div className="view-card" style={{ marginBottom: 16 }}>
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <CalendarClock size={15} />
            Agenda — prochains RDV
          </div>
          <span className="badge badge-neutral">{aVenir.length}</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {aVenir.length === 0 ? (
            <Empty>Aucun RDV à venir.</Empty>
          ) : (
            Array.from(parJour.entries()).map(([jour, items]) => (
              <div key={jour}>
                <div
                  style={{
                    padding: '8px 20px',
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                    color: 'var(--text-4)',
                    background: 'var(--glass-bg-strong)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {jour}
                </div>
                {items.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 20px',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--text-1)',
                        minWidth: 64,
                      }}
                    >
                      <Clock size={13} style={{ color: 'var(--text-4)' }} />
                      {fmtHeure(r.date)}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <LeadName r={r} />
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                        {r.source}
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
                      {EUR.format(r.potentielEur)}
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* À relancer (no-show + reportés) */}
      <div className="view-card" style={{ marginBottom: 16 }}>
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <AlertTriangle size={15} style={{ color: 'var(--warning)' }} />À relancer — no-shows &
            reportés
          </div>
          <span className="badge badge-warning">{aRelancer.length}</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {aRelancer.length === 0 ? (
            <Empty>Rien à relancer. 👌</Empty>
          ) : (
            aRelancer.map((r, idx) => {
              const b = statutBadge(r.statut);
              return (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 20px',
                    borderBottom: idx === aRelancer.length - 1 ? 'none' : '1px solid var(--border)',
                  }}
                >
                  <RotateCcw size={15} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <LeadName r={r} />
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                      RDV du {fmtJour(r.date)} · {r.source}
                    </div>
                  </div>
                  <span className={`badge ${b.cls}`}>{b.label}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Suivi des leads */}
      <div className="view-card">
        <div className="view-card-header">
          <div
            className="view-card-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <TrendingUp size={15} />
            Suivi des leads issus des RDV
          </div>
          <span className="badge badge-neutral">{RDVS.length}</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          <div className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-4)' }}>
                  <Th>Lead</Th>
                  <Th>Source</Th>
                  <Th>Date RDV</Th>
                  <Th>RDV</Th>
                  <Th>Étape pipeline</Th>
                  <Th align="right">Potentiel</Th>
                </tr>
              </thead>
              <tbody>
                {RDVS.map((r) => {
                  const b = statutBadge(r.statut);
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <Td>
                        <LeadName r={r} />
                        <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{r.email}</div>
                      </Td>
                      <Td>{r.source}</Td>
                      <Td>
                        {r.date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ·{' '}
                        {fmtHeure(r.date)}
                      </Td>
                      <Td>
                        <span className={`badge ${b.cls}`}>{b.label}</span>
                      </Td>
                      <Td>
                        <span className={`badge ${etapeBadge(r.etape)}`}>{r.etape}</span>
                      </Td>
                      <Td align="right">
                        <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                          {EUR.format(r.potentielEur)}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function LeadName({ r }: { r: Rdv }) {
  if (r.investorId) {
    return (
      <Link
        href={`/closing/investor/${r.investorId}`}
        style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand)', textDecoration: 'none' }}
      >
        {r.lead}
      </Link>
    );
  }
  return <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{r.lead}</span>;
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const color =
    tone === 'success'
      ? 'var(--success)'
      : tone === 'warning'
        ? 'var(--warning)'
        : tone === 'danger'
          ? 'var(--danger)'
          : 'var(--text-1)';
  return (
    <div className="view-card">
      <div
        className="view-card-body"
        style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 16 }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--text-3)',
          }}
        >
          {icon}
          {label}
        </span>
        <span style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{hint}</span>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 24, fontSize: 13, color: 'var(--text-3)' }}>{children}</div>;
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      style={{
        padding: '10px 16px',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        textAlign: align,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td style={{ padding: '12px 16px', textAlign: align, color: 'var(--text-2)' }}>{children}</td>
  );
}
