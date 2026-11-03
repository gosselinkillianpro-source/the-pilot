/**
 * Club deal : e-mails transactionnels et contact Brevo, envoyés APRÈS la réponse
 * au formulaire (l'investisseur n'attend pas Brevo). Sans clé ou sans expéditeur,
 * rien ne part et tout le reste fonctionne.
 */
import { type ClubDealRow, DISPOS, DOSSIERS, label, MONTANTS, STATUTS } from './constants';
import { esc } from './core';

export type BrevoConfig = {
  apiKey?: string;
  sender?: { name: string; email: string };
  notifyTo?: string[];
  replyTo?: string;
  listId?: number;
};

export type CopyConfig = { delayText: string; places: number; adminUrl: string };

export type Logger = (err: unknown, ctx?: string) => void;

const BREVO_API = 'https://api.brevo.com/v3';

async function brevoCall(apiKey: string, path: string, body: unknown): Promise<void> {
  const r = await fetch(BREVO_API + path, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Brevo ${path} ${r.status} ${(await r.text()).slice(0, 200)}`);
}

function shell(inner: string): string {
  return `<div style="background:#FAF8F4;padding:28px 12px;font-family:Poppins,Arial,sans-serif"><div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #ECE8E1;border-radius:14px"><div style="padding:22px 30px;border-bottom:1px solid #ECE8E1;font:700 15px Arial;letter-spacing:.16em;color:#B29359">SEVEN AT HOME</div><div style="padding:26px 30px;font-size:15px;line-height:1.6;color:#1F1D1A">${inner}</div><div style="padding:16px 30px;border-top:1px solid #ECE8E1;font-size:11.5px;line-height:1.6;color:#9A958D">Investir comporte un risque de perte en capital et un risque d'illiquidité. Les durées, rendements et marges évoqués sont des cibles, non garantis. Ce message ne constitue ni une offre ni une sollicitation de souscription.</div></div></div>`;
}

function confirmationHtml(row: ClubDealRow, dossiers: string, copy: CopyConfig): string {
  return shell(`<h1 style="margin:0 0 16px;font-size:22px">Bonjour ${esc(row.prenom)}, c'est bien reçu.</h1>
    <p>Votre manifestation d'intérêt est enregistrée sous la référence <strong style="color:#B29359">${esc(row.ref)}</strong>.</p>
    <p style="background:#FAF8F4;border:1px solid #ECE8E1;border-radius:10px;padding:14px 16px;color:#55514B">Dossiers : <strong style="color:#1F1D1A">${esc(dossiers)}</strong><br>Montant envisagé : <strong style="color:#1F1D1A">${esc(label(MONTANTS, row.montant))}</strong><br>Disponibilité : <strong style="color:#1F1D1A">${esc(label(DISPOS, row.disponibilite))}</strong></p>
    <p>L'équipe au siège vous enverra le dossier complet et les documents contractuels sous ${esc(copy.delayText)}, dans la limite des ${copy.places} places. Une question entre-temps ? Répondez simplement à cet e-mail.</p>
    <p>À très vite,<br><strong>L'équipe Seven At Home</strong></p>`);
}

function notificationHtml(row: ClubDealRow, dossiers: string, copy: CopyConfig): string {
  const tel = row.telephone
    ? esc(row.telephone) +
      (row.consent_tel ? ' (accord pour un appel)' : " (PAS d'accord pour un appel)")
    : 'non renseigné';
  return shell(`<h1 style="margin:0 0 14px;font-size:20px">${esc(`${row.prenom} ${row.nom}`)} <span style="color:#B29359">${esc(row.ref)}</span></h1>
    ${row.duplicate_of ? `<p style="background:#FFF4E5;border:1px solid #F5D9A8;border-radius:8px;padding:10px 12px">Doublon possible de ${esc(row.duplicate_of)}.</p>` : ''}
    <p>E-mail : ${esc(row.email)}<br>Téléphone : ${tel}<br>
    Profil : ${esc(label(STATUTS, row.statut))}<br>Dossiers : ${esc(dossiers)}<br>Montant : ${esc(label(MONTANTS, row.montant))}<br>Disponibilité : ${esc(label(DISPOS, row.disponibilite))}<br>Message : ${esc(row.message || 'aucun')}</p>
    ${copy.adminUrl ? `<p><a href="${esc(copy.adminUrl)}" style="display:inline-block;background:#B29359;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Ouvrir dans The Pilot</a></p>` : ''}`);
}

export async function sendAfterInsert(
  row: ClubDealRow,
  brevo: BrevoConfig,
  copy: CopyConfig,
  log: Logger,
): Promise<void> {
  const { apiKey, sender } = brevo;
  if (!apiKey || !sender?.email) return;
  const dossiers = row.dossiers.map((c) => label(DOSSIERS, c)).join(' ; ');
  const listIds = brevo.listId ? { listIds: [brevo.listId] } : {};
  const tasks: Promise<void>[] = [];

  // Confirmation à l'investisseur
  tasks.push(
    brevoCall(apiKey, '/smtp/email', {
      sender,
      to: [{ email: row.email, name: `${row.prenom} ${row.nom}` }],
      replyTo: brevo.replyTo ? { email: brevo.replyTo } : undefined,
      subject: `Votre manifestation d'intérêt est bien reçue (${row.ref})`,
      htmlContent: confirmationHtml(row, dossiers, copy),
    }).catch((e: unknown) => log(e, 'confirmation')),
  );

  // Notification de l'équipe
  if (brevo.notifyTo?.length) {
    tasks.push(
      brevoCall(apiKey, '/smtp/email', {
        sender,
        to: brevo.notifyTo.map((email) => ({ email })),
        replyTo: { email: row.email },
        subject: `[Club deal] ${row.prenom} ${row.nom} · ${row.ref}${row.duplicate_of ? ' · doublon possible' : ''}`,
        htmlContent: notificationHtml(row, dossiers, copy),
      }).catch((e: unknown) => log(e, 'notification')),
    );
  }

  // Contact Brevo (le téléphone n'est poussé qu'avec l'accord explicite).
  // Si un attribut n'existe pas dans le compte Brevo, on retente avec le minimum.
  const attributes: Record<string, string> = {
    PRENOM: row.prenom,
    NOM: row.nom,
    CLUB_DEAL_REF: row.ref,
    CLUB_DEAL_DOSSIERS: row.dossiers.join(', '),
    CLUB_DEAL_MONTANT: label(MONTANTS, row.montant),
    CLUB_DEAL_DISPO: label(DISPOS, row.disponibilite),
  };
  if (row.telephone && row.consent_tel) attributes.SMS = row.telephone;
  tasks.push(
    brevoCall(apiKey, '/contacts', {
      email: row.email,
      attributes,
      updateEnabled: true,
      ...listIds,
    })
      .catch(() =>
        brevoCall(apiKey, '/contacts', {
          email: row.email,
          attributes: { PRENOM: row.prenom, NOM: row.nom },
          updateEnabled: true,
          ...listIds,
        }),
      )
      .catch((e: unknown) => log(e, 'contact')),
  );

  await Promise.all(tasks);
}
