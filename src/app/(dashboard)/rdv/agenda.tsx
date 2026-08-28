'use client';

import { CalendarDays, ChevronLeft, ChevronRight, Clock, Phone, Video } from 'lucide-react';
import { useState } from 'react';

/**
 * L'agenda de la semaine — rendez-vous ET rappels au même endroit.
 *
 * Un rappel est un rendez-vous avec soi-même : le séparer des RDV Calendly,
 * c'est garantir qu'on en oublie la moitié. Ils partagent donc la même grille,
 * distingués par la couleur et l'icône.
 *
 * Vue SEMAINE et pas mois : les rendez-vous se préparent à la journée, et un
 * mois entier sur sept colonnes réduit chaque RDV à un point illisible. La
 * navigation permet de reculer pour retrouver un échange passé.
 */

export type AgendaItem = {
  id: string;
  kind: 'rdv' | 'rappel';
  at: Date;
  title: string;
  /** Second niveau : statut du RDV, ou note du rappel. */
  detail: string | null;
  /** Lien à ouvrir au clic (fiche investisseur, visio…). */
  href: string | null;
  /** Rendez-vous annulé ou rappel en retard : la carte le dit. */
  tone: 'normal' | 'warning' | 'danger' | 'done';
};

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/** Lundi de la semaine contenant `d`, à minuit. */
function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  // getDay() : 0 = dimanche. On ramène au lundi précédent.
  const shift = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - shift);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

function fmtHeure(d: Date): string {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function toneColor(tone: AgendaItem['tone']): string {
  if (tone === 'danger') return 'var(--danger)';
  if (tone === 'warning') return 'var(--warning)';
  if (tone === 'done') return 'var(--text-4)';
  return 'var(--brand)';
}

export function Agenda({ items }: { items: AgendaItem[] }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 7);

  const ofWeek = items
    .filter((i) => i.at >= weekStart && i.at < weekEnd)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const label = `${weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} → ${addDays(
    weekStart,
    6,
  ).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  return (
    <div className="view-card">
      <div className="view-card-header">
        <div>
          <div className="view-card-title">
            <CalendarDays size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            Semaine du {label}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 2 }}>
            Rendez-vous Calendly et rappels programmés, ensemble.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Semaine précédente"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
          >
            Aujourd'hui
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Semaine suivante"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="view-card-body" style={{ padding: 10 }}>
        <div className="agenda-week">
          {days.map((day) => {
            const dayItems = ofWeek.filter((i) => sameDay(i.at, day));
            const isToday = sameDay(day, today);
            const weekend = day.getDay() === 0 || day.getDay() === 6;
            return (
              <section
                key={day.toISOString()}
                className="agenda-day"
                data-today={isToday}
                data-weekend={weekend}
              >
                <header style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: isToday ? 'var(--brand)' : 'var(--text-4)',
                      fontWeight: 700,
                    }}
                  >
                    {JOURS[(day.getDay() + 6) % 7]}
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: isToday ? 'var(--brand)' : 'var(--text-2)',
                      lineHeight: 1.2,
                    }}
                  >
                    {day.getDate()}
                  </div>
                </header>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {dayItems.length === 0 ? (
                    <div style={{ fontSize: 10.5, color: 'var(--text-4)' }}>—</div>
                  ) : (
                    dayItems.map((item) => <Slot key={item.id} item={item} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Slot({ item }: { item: AgendaItem }) {
  const color = toneColor(item.tone);
  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
        {item.kind === 'rdv' ? <Video size={9} /> : <Phone size={9} />}
        <span style={{ fontSize: 10.5, fontWeight: 700 }}>{fmtHeure(item.at)}</span>
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-1)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {item.title}
      </div>
      {item.detail && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-4)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.detail}
        </div>
      )}
    </>
  );

  const style = {
    display: 'block',
    borderLeft: `2px solid ${color}`,
    background: 'var(--surface)',
    borderRadius: 6,
    padding: '5px 6px',
    color,
    textDecoration: 'none',
    opacity: item.tone === 'done' ? 0.6 : 1,
  } as const;

  if (item.href) {
    return (
      <a
        href={item.href}
        style={style}
        title={`${item.title}${item.detail ? ` — ${item.detail}` : ''}`}
      >
        {body}
      </a>
    );
  }
  return (
    <div style={style} title={item.detail ?? item.title}>
      {body}
    </div>
  );
}

/** Bandeau « ce qui arrive » — la seule ligne à lire en arrivant le matin. */
export function NextUp({ items }: { items: AgendaItem[] }) {
  const now = Date.now();
  const next = items
    .filter((i) => i.at.getTime() >= now && i.tone !== 'done')
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  const late = items.filter((i) => i.tone === 'danger' && i.at.getTime() < now).length;

  if (!next && late === 0) return null;

  const minutes = next ? Math.round((next.at.getTime() - now) / 60_000) : 0;
  const quand =
    minutes < 60
      ? `dans ${Math.max(1, minutes)} min`
      : minutes < 60 * 24
        ? `à ${fmtHeure(next?.at ?? new Date())}`
        : next?.at.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div
      className="view-card"
      style={{ borderColor: next && minutes <= 30 ? 'var(--brand)' : 'var(--border)' }}
    >
      <div
        className="view-card-body"
        style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: 14 }}
      >
        <Clock size={16} style={{ color: 'var(--brand)', flexShrink: 0 }} />
        {next ? (
          <div style={{ fontSize: 13, flex: 1, minWidth: 200 }}>
            <strong>{next.kind === 'rdv' ? 'Prochain RDV' : 'Prochain rappel'}</strong> {quand} —{' '}
            {next.title}
            {next.detail ? <span style={{ color: 'var(--text-3)' }}> · {next.detail}</span> : null}
          </div>
        ) : (
          <div style={{ fontSize: 13, flex: 1 }}>Rien de prévu dans les jours qui viennent.</div>
        )}
        {late > 0 && (
          <span className="badge badge-danger">
            {late} rappel{late > 1 ? 's' : ''} en retard
          </span>
        )}
      </div>
    </div>
  );
}
