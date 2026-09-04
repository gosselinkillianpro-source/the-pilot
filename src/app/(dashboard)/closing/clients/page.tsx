import { Phone, Search, UserSquare2 } from 'lucide-react';
import Link from 'next/link';
import { CloserPicker } from '@/components/closing/closer-picker';
import { getAuthenticatedUser } from '@/lib/auth';
import { activityLabel, eur, fmtAgo, fmtDateTime, taskLabel } from '@/lib/closing/format';
import { parisDateOf, parisMidnightUTC } from '@/lib/closing/gamification/periods';
import { type InvestorOrigin, ORIGINS, originMeta } from '@/lib/closing/origin';
import {
  ALL_MISSIONS,
  type MissionKey,
  RELATIONSHIP_STATES,
  type RelationshipState,
  relationshipStateMeta,
} from '@/lib/closing/relationship-state';
import { type ClientRow, listMyClients } from '@/lib/db/queries/closer-day';
import { listCreditedSubscriptions } from '@/lib/db/queries/portfolio';
import { resolveViewedCloser } from '@/lib/db/queries/viewed-closer';

/**
 * « Mes clients » — le carnet du closer (refonte du 4 sept. 2026).
 *
 * Une seule liste : chaque personne dont il est propriétaire, avec un état
 * DÉDUIT des faits (personne ne range une carte), son origine (pub,
 * parrainage, venu seul, partenaire), sa mission du moment, sa prochaine
 * action et son dernier contact. Les filtres remplacent les colonnes des
 * anciens kanbans ; « sans prochaine action » doit rester à zéro.
 */

export const dynamic = 'force-dynamic';

const BASE = '/closing/clients';
const NO_ACTION = 'sans-action';

type Params = { closer?: string; etat?: string; mission?: string; origine?: string; q?: string };

function matches(c: ClientRow, q: string): boolean {
  const hay = [c.fullName ?? '', c.email, c.phone ?? '', c.city ?? ''].join(' ').toLowerCase();
  return hay.includes(q);
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [sp, user] = await Promise.all([searchParams, getAuthenticatedUser()]);
  const viewed = await resolveViewedCloser(user, sp.closer);
  const now = new Date();
  const [clients, credited] = await Promise.all([
    listMyClients(viewed.viewedId, now),
    listCreditedSubscriptions(viewed.viewedId),
  ]);
  const canAct = user.role !== 'executive';

  const today = parisDateOf(now);
  const monthStart = parisMidnightUTC(today.year, today.month, 1);
  const collectedMonthEur = credited
    .filter((s) => s.signedAt.getTime() >= monthStart.getTime())
    .reduce((t, s) => t + s.amountEur, 0);

  const etat = RELATIONSHIP_STATES.find((s) => s.key === sp.etat)?.key ?? null;
  const noAction = sp.etat === NO_ACTION;
  const mission = ALL_MISSIONS.find((m) => m.key === sp.mission)?.key ?? null;
  const origine = ORIGINS.find((o) => o.key === sp.origine)?.key ?? null;
  const q = (sp.q ?? '').trim().toLowerCase();

  const filtered = clients.filter(
    (c) =>
      (!etat || c.state === etat) &&
      (!noAction || !c.followUp?.nextTask) &&
      (!mission || c.mission.key === mission) &&
      (!origine || c.origin === origine) &&
      (!q || matches(c, q)),
  );

  const countState = (k: RelationshipState) => clients.filter((c) => c.state === k).length;
  const countMission = (k: MissionKey) => clients.filter((c) => c.mission.key === k).length;
  const countOrigin = (k: InvestorOrigin) => clients.filter((c) => c.origin === k).length;
  const withoutAction = clients.filter(
    (c) => !c.followUp?.nextTask && c.state !== 'client' && c.state !== 'lost',
  ).length;

  const href = (over: Partial<Params>) => {
    const next: Params = {
      closer: sp.closer,
      etat: sp.etat,
      mission: sp.mission,
      origine: sp.origine,
      q: sp.q,
      ...over,
    };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${BASE}?${s}` : BASE;
  };
  const backHref = href({});

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
            <UserSquare2 size={20} style={{ color: 'var(--brand)' }} />
            {viewed.isMine ? 'Mes clients' : `Clients de ${viewed.viewedName ?? 'ce closer'}`}
          </h1>
          <div className="page-desc">
            {clients.length} personne{clients.length > 1 ? 's' : ''} suivie
            {clients.length > 1 ? 's' : ''} · {countOrigin('ads')} venue
            {countOrigin('ads') > 1 ? 's' : ''} des pubs · {eur(collectedMonthEur)} collectés ce
            mois · {countState('ready')} prêt{countState('ready') > 1 ? 's' : ''} à investir
            {withoutAction > 0 ? ` · ${withoutAction} sans prochaine action` : ''}
          </div>
        </div>
        <form action={BASE} method="get" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {sp.closer ? <input type="hidden" name="closer" value={sp.closer} /> : null}
          {sp.etat ? <input type="hidden" name="etat" value={sp.etat} /> : null}
          {sp.mission ? <input type="hidden" name="mission" value={sp.mission} /> : null}
          {sp.origine ? <input type="hidden" name="origine" value={sp.origine} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="Nom, email, téléphone, ville"
            className="input"
            style={{ minWidth: 220 }}
            aria-label="Rechercher dans mes clients"
          />
          <button type="submit" className="btn btn-secondary btn-sm">
            <Search size={13} />
            Chercher
          </button>
        </form>
      </div>

      <CloserPicker
        viewed={viewed}
        basePath={BASE}
        params={{ etat: sp.etat, mission: sp.mission, origine: sp.origine }}
      />

      {/* Filtres par état */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterLabel>État</FilterLabel>
        <Chip href={href({ etat: undefined })} active={!etat && !noAction}>
          Tous <Count n={clients.length} />
        </Chip>
        {RELATIONSHIP_STATES.map((s) => (
          <Chip key={s.key} href={href({ etat: s.key })} active={etat === s.key} title={s.hint}>
            {s.label} <Count n={countState(s.key)} />
          </Chip>
        ))}
        <Chip
          href={href({ etat: NO_ACTION })}
          active={noAction}
          title="Personnes suivies sans prochaine action planifiée"
          tone={withoutAction > 0 ? 'warning' : undefined}
        >
          Sans prochaine action <Count n={withoutAction} />
        </Chip>
      </div>

      {/* Filtres par origine : pubs contre tout le reste */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterLabel>Origine</FilterLabel>
        <Chip href={href({ origine: undefined })} active={!origine}>
          Toutes
        </Chip>
        {ORIGINS.map((o) => (
          <Chip
            key={o.key}
            href={href({ origine: o.key })}
            active={origine === o.key}
            title={o.hint}
          >
            {o.label} <Count n={countOrigin(o.key)} />
          </Chip>
        ))}
      </div>

      {/* Filtres par mission */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterLabel>Mission</FilterLabel>
        <Chip href={href({ mission: undefined })} active={!mission}>
          Toutes
        </Chip>
        {ALL_MISSIONS.map((m) => {
          const n = countMission(m.key);
          if (n === 0 && mission !== m.key) return null;
          return (
            <Chip key={m.key} href={href({ mission: m.key })} active={mission === m.key}>
              {m.label} <Count n={n} />
            </Chip>
          );
        })}
      </div>

      <div className="view-card">
        <div className="view-card-body" style={{ padding: 0 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 24, fontSize: 13, color: 'var(--text-3)' }}>
              {clients.length === 0
                ? 'Aucun client pour l’instant. Prends une personne dans le pool depuis « Aujourd’hui » : dès ton premier résultat enregistré, elle est à toi.'
                : 'Personne ne correspond à ces filtres.'}
            </div>
          ) : (
            <div className="table-scroll" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <Th>Personne</Th>
                    <Th>Origine</Th>
                    <Th>État</Th>
                    <Th>Mission</Th>
                    <Th>Prochaine action</Th>
                    <Th>Dernier contact</Th>
                    <Th align="right">Investi</Th>
                    <Th> </Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <ClientLine key={c.id} c={c} now={now} backHref={backHref} canAct={canAct} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ClientLine({
  c,
  now,
  backHref,
  canAct,
}: {
  c: ClientRow;
  now: Date;
  backHref: string;
  canAct: boolean;
}) {
  const meta = relationshipStateMeta(c.state);
  const origin = originMeta(c.origin);
  const next = c.followUp?.nextTask ?? null;
  const late = next != null && next.dueAt.getTime() < now.getTime();
  const last = c.lastActivity;
  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <Td>
        <Link
          href={`/closing/investor/${c.id}?from=${encodeURIComponent(backHref)}`}
          style={{ fontWeight: 600, color: 'var(--text-1)', display: 'block' }}
        >
          {c.fullName ?? c.email}
        </Link>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
          {[c.city, c.bonusCode ? `code ${c.bonusCode}` : null].filter(Boolean).join(' · ')}
        </span>
      </Td>
      <Td>
        <span className={`badge ${origin.badge}`} style={{ fontSize: 10 }} title={origin.hint}>
          {origin.label}
        </span>
      </Td>
      <Td>
        <span className={`badge ${meta.badge}`} style={{ fontSize: 10 }} title={meta.hint}>
          {meta.label}
        </span>
      </Td>
      <Td>
        <span className={`badge ${c.mission.badge}`} style={{ fontSize: 10 }}>
          {c.mission.label}
        </span>
      </Td>
      <Td>
        {next ? (
          <>
            <span style={{ display: 'block' }}>{taskLabel(next.type)}</span>
            <span
              style={{
                fontSize: 11,
                color: late ? 'var(--danger)' : 'var(--text-3)',
                fontWeight: late ? 600 : 400,
              }}
            >
              {fmtDateTime(next.dueAt)}
              {late ? ' · en retard' : ''}
            </span>
          </>
        ) : c.state === 'client' || c.state === 'lost' ? (
          <span style={{ color: 'var(--text-4)' }}>—</span>
        ) : (
          <span className="badge badge-warning" style={{ fontSize: 10 }}>
            à planifier
          </span>
        )}
      </Td>
      <Td>
        {last ? (
          <>
            <span style={{ display: 'block' }}>{activityLabel(last)}</span>
            {last.at ? (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtAgo(last.at, now)}</span>
            ) : null}
          </>
        ) : (
          <span style={{ color: 'var(--text-4)' }}>jamais</span>
        )}
      </Td>
      <Td align="right">
        <span
          style={{
            fontVariantNumeric: 'tabular-nums',
            color: c.totalInvested > 0 ? 'var(--text-1)' : 'var(--text-4)',
          }}
        >
          {c.totalInvested > 0 ? eur(c.totalInvested) : '—'}
        </span>
      </Td>
      <Td align="right">
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {c.phone ? (
            <a href={`tel:${c.phone}`} className="btn btn-primary btn-sm" aria-label="Appeler">
              <Phone size={13} />
            </a>
          ) : null}
          {canAct ? (
            <Link
              href={`/closing/session?lead=${c.id}&from=${encodeURIComponent(backHref)}`}
              className="btn btn-secondary btn-sm"
            >
              Résultat
            </Link>
          ) : null}
        </div>
      </Td>
    </tr>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: '9px 12px',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-3)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td style={{ textAlign: align, padding: '9px 12px', verticalAlign: 'top' }}>{children}</td>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        color: 'var(--text-4)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginRight: 4,
      }}
    >
      {children}
    </span>
  );
}

function Count({ n }: { n: number }) {
  return <span style={{ opacity: 0.7, fontWeight: 500, marginLeft: 3 }}>{n}</span>;
}

function Chip({
  href,
  active,
  title,
  tone,
  children,
}: {
  href: string;
  active: boolean;
  title?: string;
  tone?: 'warning';
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={active ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
      aria-current={active ? 'page' : undefined}
      style={!active && tone === 'warning' ? { color: 'var(--warning)' } : undefined}
    >
      {children}
    </Link>
  );
}
