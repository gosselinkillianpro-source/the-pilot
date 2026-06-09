import { AlertTriangle, List, Mail, PenLine, Send, Users } from 'lucide-react';
import Link from 'next/link';
import {
  getBrevoAccount,
  getBrevoCampaigns,
  getBrevoContactsCount,
  getBrevoLists,
  getBrevoTransactional,
} from '@/lib/integrations/brevo/client';

export const dynamic = 'force-dynamic';

function nb(n: number): string {
  return n.toLocaleString('fr-FR');
}

export default async function EmailPage() {
  let account: Awaited<ReturnType<typeof getBrevoAccount>>;
  let contactsCount = 0;
  let lists: Awaited<ReturnType<typeof getBrevoLists>> = [];
  let campaigns: Awaited<ReturnType<typeof getBrevoCampaigns>> = [];
  let tx: Awaited<ReturnType<typeof getBrevoTransactional>>;

  try {
    [account, contactsCount, lists, campaigns, tx] = await Promise.all([
      getBrevoAccount(),
      getBrevoContactsCount(),
      getBrevoLists(),
      getBrevoCampaigns(30),
      getBrevoTransactional(),
    ]);
  } catch (e) {
    return (
      <>
        <div>
          <h1 className="page-title">Email · Brevo</h1>
          <div className="page-desc">Données en direct depuis ton compte Brevo.</div>
        </div>
        <div className="alert alert-danger">
          <span className="alert-icon">
            <AlertTriangle size={16} />
          </span>
          <div className="alert-body">
            <div className="alert-title">Connexion Brevo impossible</div>
            <div className="alert-description">
              {e instanceof Error ? e.message : 'Erreur inconnue'}. Vérifie la clé BREVO_API_KEY
              dans .env.local.
            </div>
          </div>
        </div>
      </>
    );
  }

  const emailCredits = account.plan?.find((p) => p.type === 'subscription')?.credits ?? null;
  const smsCredits = account.plan?.find((p) => p.type === 'sms')?.credits ?? null;
  const txOpenRate = tx.delivered > 0 ? Math.round((tx.opens / tx.delivered) * 1000) / 10 : 0;
  const txClickRate = tx.delivered > 0 ? Math.round((tx.clicks / tx.delivered) * 1000) / 10 : 0;
  const activeLists = lists.filter((l) => l.uniqueSubscribers > 0);

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
        }}
      >
        <div>
          <h1 className="page-title">Email · Brevo</h1>
          <div className="page-desc">
            En direct depuis le compte <strong>{account.companyName}</strong> ({account.email})
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {emailCredits !== null && (
            <span className="badge badge-brand">{nb(emailCredits)} crédits email</span>
          )}
          {smsCredits !== null && (
            <span className="badge badge-neutral">{nb(smsCredits)} crédits SMS</span>
          )}
          <Link href="/email/contacts" className="btn btn-secondary btn-sm">
            <Users size={13} />
            Contacts
          </Link>
          <Link href="/email/sent" className="btn btn-secondary btn-sm">
            <Send size={13} />
            Boîte d'envoi
          </Link>
          <Link href="/email/campaign/new" className="btn btn-secondary btn-sm">
            <Send size={13} />
            Campagne
          </Link>
          <Link href="/email/compose" className="btn btn-primary btn-sm">
            <PenLine size={13} />
            Composer
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Kpi
          icon={<Users size={14} />}
          label="Contacts"
          value={nb(contactsCount)}
          sub="dans Brevo"
        />
        <Kpi
          icon={<List size={14} />}
          label="Listes"
          value={nb(lists.length)}
          sub={`${activeLists.length} avec contacts`}
        />
        <Kpi
          icon={<Send size={14} />}
          label="Campagnes envoyées"
          value={nb(campaigns.length)}
          sub="récentes"
        />
        <Kpi
          icon={<Mail size={14} />}
          label="Taux ouverture (transac.)"
          value={`${txOpenRate}%`}
          sub={`${nb(tx.opens)} ouvertures`}
        />
      </div>

      {/* Transactionnel */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Emails transactionnels (cumul)</div>
          <span className="badge badge-success badge-dot">Brevo connecté</span>
        </div>
        <div
          className="view-card-body"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}
        >
          <Stat label="Envoyés" value={nb(tx.requests)} />
          <Stat label="Délivrés" value={nb(tx.delivered)} />
          <Stat label="Ouvertures" value={`${nb(tx.opens)} · ${txOpenRate}%`} />
          <Stat label="Clics" value={`${nb(tx.clicks)} · ${txClickRate}%`} />
        </div>
      </div>

      {/* Campagnes */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Campagnes email récentes</div>
          <span className="badge badge-neutral">{campaigns.length} affichées</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          <div
            className="r-stack r-head"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 90px 90px 90px 80px',
              gap: 12,
              padding: '10px 20px',
              borderBottom: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-4)',
            }}
          >
            <span>Campagne</span>
            <span style={{ textAlign: 'right' }}>Envois</span>
            <span style={{ textAlign: 'right' }}>Ouvert.</span>
            <span style={{ textAlign: 'right' }}>Clics</span>
            <span style={{ textAlign: 'right' }}>Taux ouv.</span>
          </div>
          {campaigns.map((c, idx) => (
            <div
              key={c.id}
              className="r-stack"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 90px 90px 90px 80px',
                gap: 12,
                alignItems: 'center',
                padding: '12px 20px',
                borderBottom: idx < campaigns.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: 'var(--text-1)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {c.name}
              </span>
              <span
                style={{
                  textAlign: 'right',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--text-2)',
                }}
              >
                {nb(c.sent)}
              </span>
              <span
                style={{
                  textAlign: 'right',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--text-2)',
                }}
              >
                {nb(c.uniqueViews)}
              </span>
              <span
                style={{
                  textAlign: 'right',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--text-2)',
                }}
              >
                {nb(c.uniqueClicks)}
              </span>
              <span
                style={{
                  textAlign: 'right',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: c.openRate >= 30 ? 'var(--success)' : 'var(--text-1)',
                }}
              >
                {c.openRate}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Listes */}
      <div className="view-card">
        <div className="view-card-header">
          <div className="view-card-title">Listes de contacts</div>
          <span className="badge badge-neutral">{lists.length} listes</span>
        </div>
        <div className="view-card-body" style={{ padding: 0 }}>
          {lists.slice(0, 15).map((l, idx) => (
            <div
              key={l.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '12px 20px',
                borderBottom:
                  idx < Math.min(lists.length, 15) - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'var(--brand-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--brand)',
                  flexShrink: 0,
                }}
              >
                <List size={15} />
              </div>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{l.name}</span>
              {l.totalBlacklisted > 0 && (
                <span
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)' }}
                >
                  {nb(l.totalBlacklisted)} désinscrits
                </span>
              )}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-1)',
                  minWidth: 90,
                  textAlign: 'right',
                }}
              >
                {nb(l.uniqueSubscribers)} contacts
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="alert alert-info">
        <span className="alert-icon">
          <Mail size={16} />
        </span>
        <div className="alert-body">
          <div className="alert-title">Données réelles, en lecture seule</div>
          <div className="alert-description">
            Ces chiffres viennent en direct de Brevo (rafraîchis toutes les 5 min). Prochaine étape
            : relier ces contacts aux fiches investisseurs + envoyer des emails depuis THE PILOT
            avec le scanner AMF.
          </div>
        </div>
      </div>
    </>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="kpi-hero">
      <div className="kpi-hero-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon}
        {label}
      </div>
      <div className="kpi-hero-value">{value}</div>
      <div className="kpi-hero-trend">
        <span>{sub}</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-4)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{value}</div>
    </div>
  );
}
