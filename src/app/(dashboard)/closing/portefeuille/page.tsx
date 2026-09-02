import {
  BadgeCheck,
  CalendarClock,
  KanbanSquare,
  PartyPopper,
  Phone,
  Trophy,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getAuthenticatedUser } from '@/lib/auth';
import { CLOSING_STAGE_LABELS } from '@/lib/closing/pipeline';
import {
  classifyPortfolio,
  type PortfolioLead,
  resolvePortfolioPeriod,
} from '@/lib/closing/portfolio';
import { getClosers } from '@/lib/db/queries/closing';
import { listPortfolioLeads } from '@/lib/db/queries/portfolio';

export const dynamic = 'force-dynamic';

/**
 * « Mon portefeuille » — la vue RÉSULTATS du closer.
 *
 * Retour terrain : depuis le classement, un closer voit son total mais plus
 * NOMINATIVEMENT qui a investi et combien. Cette page répond à ça : ses leads
 * à lui, rangés par jalon atteint — investi, KYC ok, inscrit, en cours — avec
 * les montants, filtrables par période.
 */

function eur(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Europe/Paris',
  });
}

const PERIOD_TABS: { key: 'semaine' | 'mois' | 'tout'; label: string }[] = [
  { key: 'semaine', label: 'Semaine' },
  { key: 'mois', label: 'Mois' },
  { key: 'tout', label: 'Tout' },
];

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ closer?: string; periode?: string; du?: string; au?: string }>;
}) {
  const [sp, user] = await Promise.all([searchParams, getAuthenticatedUser()]);

  // Même vue superviseur que « Mes leads » : un closer voit SON portefeuille,
  // admin et direction choisissent le closer.
  const canPick = user.role === 'admin' || user.role === 'executive';
  const pickable = canPick
    ? [...(await getClosers())].sort((a, b) =>
        a.role === b.role
          ? (a.name ?? '').localeCompare(b.name ?? '')
          : a.role === 'admin'
            ? 1
            : -1,
      )
    : [];
  const requested = canPick && sp.closer ? pickable.find((c) => c.id === sp.closer) : undefined;
  const fallbackId = user.role === 'admin' ? user.id : (pickable[0]?.id ?? user.id);
  const viewedId = requested?.id ?? (canPick ? fallbackId : user.id);
  const viewedName = requested?.name ?? pickable.find((c) => c.id === viewedId)?.name ?? null;
  const isMine = viewedId === user.id;

  const period = resolvePortfolioPeriod(sp);
  const leads = await listPortfolioLeads(viewedId);
  const sections = classifyPortfolio(leads, period);

  const collectedEur = sections.invested.reduce((s, e) => s + e.periodEur, 0);
  const href = (params: { periode?: string; du?: string; au?: string }) => {
    const p = new URLSearchParams();
    if (canPick && sp.closer) p.set('closer', sp.closer);
    if (params.periode && params.periode !== 'tout') p.set('periode', params.periode);
    if (params.du && params.au) {
      p.set('du', params.du);
      p.set('au', params.au);
    }
    const q = p.toString();
    return q ? `/closing/portefeuille?${q}` : '/closing/portefeuille';
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wallet size={20} style={{ color: 'var(--brand)' }} />
            {isMine ? 'Mon portefeuille' : `Portefeuille de ${viewedName ?? 'ce closer'}`}
          </h1>
          <div className="page-desc">
            {isMine
              ? 'Qui est passé à l’action parmi tes leads — et pour combien. Les montants comptés sont ceux investis après ton premier appel.'
              : 'Vue superviseur : les résultats nominatifs de ce closer.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/closing/classement" className="btn btn-secondary btn-sm">
            <Trophy size={13} />
            Classement
          </Link>
          <Link href="/closing/mes-leads" className="btn btn-secondary btn-sm">
            <KanbanSquare size={13} />
            Mes leads
          </Link>
        </div>
      </div>

      {canPick && pickable.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-3)',
              display: 'flex',
              gap: 5,
              alignItems: 'center',
            }}
          >
            <Users size={13} />
            Portefeuille de :
          </span>
          {pickable.map((c) => {
            // Changer de closer ne doit pas faire perdre la période choisie.
            const p = new URLSearchParams({ closer: c.id });
            if (sp.periode) p.set('periode', sp.periode);
            if (sp.du && sp.au) {
              p.set('du', sp.du);
              p.set('au', sp.au);
            }
            return (
              <Link
                key={c.id}
                href={`/closing/portefeuille?${p.toString()}`}
                className={c.id === viewedId ? 'badge badge-brand' : 'badge badge-neutral'}
                style={{ textDecoration: 'none' }}
              >
                {c.name ?? 'Sans nom'}
                {c.role === 'admin' ? ' (admin)' : ''}
              </Link>
            );
          })}
        </div>
      )}

      {/* Période : onglets + dates libres. Formulaire GET pur, pas de JS. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {PERIOD_TABS.map((t) => (
          <Link
            key={t.key}
            href={href({ periode: t.key })}
            className={period.key === t.key ? 'badge badge-brand' : 'badge badge-neutral'}
            style={{ textDecoration: 'none' }}
          >
            {t.label}
          </Link>
        ))}
        <form
          method="get"
          action="/closing/portefeuille"
          style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}
        >
          {canPick && sp.closer && <input type="hidden" name="closer" value={sp.closer} />}
          <input
            type="date"
            name="du"
            defaultValue={sp.du}
            required
            aria-label="Du"
            className="input"
            style={{ fontSize: 12, padding: '3px 8px', height: 28 }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-4)' }}>→</span>
          <input
            type="date"
            name="au"
            defaultValue={sp.au}
            required
            aria-label="Au"
            className="input"
            style={{ fontSize: 12, padding: '3px 8px', height: 28 }}
          />
          <button type="submit" className="btn btn-secondary btn-sm">
            Filtrer
          </button>
          {period.key === 'custom' && (
            <Link
              href={href({})}
              style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none' }}
            >
              ✕ effacer
            </Link>
          )}
        </form>
        <span style={{ fontSize: 12, color: 'var(--text-4)' }}>{period.label}</span>
      </div>

      {/* La ligne de résultats — ce que le closer vient chercher en 2 secondes. */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard
          label={
            period.key !== 'tout'
              ? 'Collecté sur la période'
              : isMine
                ? 'Collecté grâce à toi'
                : 'Collecté par ce closer'
          }
          value={eur(collectedEur)}
          tone="var(--success)"
          icon={<PartyPopper size={14} />}
        />
        <StatCard
          label="Ont investi"
          value={String(sections.invested.length)}
          tone={sections.invested.length > 0 ? 'var(--success)' : undefined}
          icon={<BadgeCheck size={14} />}
        />
        <StatCard
          label="Prêts à investir (KYC ok)"
          value={String(sections.kycReady.length)}
          tone={sections.kycReady.length > 0 ? 'var(--warning)' : undefined}
          icon={<Wallet size={14} />}
        />
        <StatCard label="Leads suivis" value={String(leads.length)} icon={<Users size={14} />} />
      </div>

      {leads.length === 0 ? (
        <div className="view-card">
          <div className="view-card-body" style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {isMine ? (
              <>
                Aucun lead attitré pour l'instant. Ouvre la{' '}
                <Link href="/closing/queue" style={{ color: 'var(--brand)' }}>
                  file d'appels
                </Link>{' '}
                et enregistre ton premier appel : ton portefeuille se remplira ici.
              </>
            ) : (
              'Aucun lead attitré à ce closer pour l’instant.'
            )}
          </div>
        </div>
      ) : (
        <>
          <Section
            emoji="🎉"
            title="Ont investi"
            accent="var(--success)"
            count={sections.invested.length}
            empty={
              period.key === 'tout'
                ? 'Personne n’a encore investi dans ce portefeuille — ça va venir.'
                : 'Aucune souscription sur cette période.'
            }
            footer={
              sections.investedOutside.length > 0 ? (
                <>
                  + {sections.investedOutside.length} hors période :{' '}
                  {sections.investedOutside
                    .map((e) => `${e.lead.fullName} (${eur(e.attributableEur)})`)
                    .join(' · ')}
                </>
              ) : null
            }
          >
            {sections.invested.map((e) => (
              <LeadRow key={e.lead.investorId} lead={e.lead}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--success)' }}>
                    {eur(period.key === 'tout' ? e.attributableEur : e.periodEur)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
                    le {fmtDate(e.lastInvestAt)}
                    {e.lead.totalInvestedEur > e.attributableEur &&
                      ` · ${eur(e.lead.totalInvestedEur)} au total client`}
                  </div>
                </div>
              </LeadRow>
            ))}
          </Section>

          <Section
            emoji="✅"
            title="KYC finalisé — peuvent investir"
            accent="var(--warning)"
            count={sections.kycReady.length}
            empty="Personne en attente avec un KYC validé."
          >
            {sections.kycReady.map((lead) => (
              <LeadRow key={lead.investorId} lead={lead}>
                <div style={{ textAlign: 'right' }}>
                  {lead.walletBalanceCents != null && lead.walletBalanceCents > 0 ? (
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning)' }}>
                      {eur(lead.walletBalanceCents / 100)} sur le wallet
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>prêt à investir</div>
                  )}
                  <NextAction lead={lead} />
                </div>
              </LeadRow>
            ))}
          </Section>

          <Section
            emoji="📝"
            title="Inscription finalisée"
            accent="var(--brand)"
            count={sections.registered.length}
            empty="Personne à cette étape : les inscrits complets sont plus haut, en KYC ou investis."
          >
            {sections.registered.map((lead) => (
              <LeadRow key={lead.investorId} lead={lead}>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--text-2)',
                      display: 'flex',
                      gap: 5,
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <UserPlus size={12} />
                    inscription complète, KYC en attente
                  </div>
                  <NextAction lead={lead} />
                </div>
              </LeadRow>
            ))}
          </Section>

          <Section
            emoji="📞"
            title="En cours"
            accent="var(--text-3)"
            count={sections.inProgress.length}
            empty="Rien en cours — tout le portefeuille a passé un jalon."
          >
            {sections.inProgress.map((lead) => (
              <LeadRow key={lead.investorId} lead={lead}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {CLOSING_STAGE_LABELS[lead.stage]}
                  </div>
                  <NextAction lead={lead} />
                </div>
              </LeadRow>
            ))}
          </Section>
        </>
      )}
    </>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="view-card" style={{ flex: '1 1 150px', minWidth: 150 }}>
      <div className="view-card-body" style={{ padding: '12px 14px' }}>
        <div
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-4)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          {icon}
          {label}
        </div>
        <div
          style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: tone ?? 'var(--text-1)' }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function Section({
  emoji,
  title,
  accent,
  count,
  empty,
  footer,
  children,
}: {
  emoji: string;
  title: string;
  accent: string;
  count: number;
  empty: string;
  /** Rendu même quand la section est vide — la mention « hors période » en dépend. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="view-card" style={{ borderLeft: `3px solid ${accent}` }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderBottom: count > 0 ? '1px solid var(--border)' : 'none',
        }}
      >
        <span style={{ fontSize: 15 }}>{emoji}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{title}</span>
        <span className="badge badge-neutral">{count}</span>
      </div>
      {count === 0 ? (
        <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-4)' }}>{empty}</div>
      ) : (
        children
      )}
      {footer && (
        <div
          style={{
            padding: '8px 14px',
            fontSize: 12,
            color: 'var(--text-3)',
            borderTop: '1px dashed var(--border)',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

function LeadRow({ lead, children }: { lead: PortfolioLead; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '9px 14px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div
          aria-hidden
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text-2)',
            flexShrink: 0,
          }}
        >
          {initials(lead.fullName)}
        </div>
        <div style={{ minWidth: 0 }}>
          <Link
            href={`/closing/investor/${lead.investorId}`}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-1)',
              textDecoration: 'none',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {lead.fullName}
          </Link>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-4)',
              display: 'flex',
              gap: 6,
              alignItems: 'center',
            }}
          >
            {lead.phone && (
              <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                <Phone size={10} />
                {lead.phone}
              </span>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.email}</span>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Prochain rappel programmé, quand il existe — l'info qui déclenche l'action. */
function NextAction({ lead }: { lead: PortfolioLead }) {
  if (!lead.nextActionAt) return null;
  return (
    <div
      style={{
        fontSize: 11,
        color: 'var(--text-4)',
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 2,
      }}
    >
      <CalendarClock size={11} />
      rappel le {fmtDate(lead.nextActionAt)}
    </div>
  );
}
