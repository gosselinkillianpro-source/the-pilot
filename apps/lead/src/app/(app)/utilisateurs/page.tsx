import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { CreateStaffForm } from '@/components/users/user-forms';
import { getAuthenticatedUser } from '@/lib/auth';
import { listSourcesForUser } from '@/lib/leads/queries';
import { listUsers } from '@/lib/users/queries';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const user = await getAuthenticatedUser();
  if (user.role !== 'admin') redirect('/utilisateurs/moi');
  const [rows, sources] = await Promise.all([listUsers(user), listSourcesForUser(user)]);
  const byId = new Map(sources.map((s) => [s.id, s.name]));
  return (
    <>
      <PageHeader
        title="Utilisateurs"
        count={rows.length}
        sub="Admins, setters et accès acheteurs. Les acheteurs sont invités depuis leur fiche."
      />
      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Rôle</th>
              <th>Périmètre</th>
              <th>Telegram</th>
              <th>De garde</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="primary">
                  {u.role !== 'buyer' ? (
                    <Link href={`/utilisateurs/${u.id}`} className="row-link">
                      {u.name ?? u.email}
                    </Link>
                  ) : (
                    (u.name ?? u.email)
                  )}
                  <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
                    {u.email}
                  </span>
                </td>
                <td>
                  <Pill
                    tone={u.role === 'admin' ? 'dark' : u.role === 'setter' ? 'brand' : 'neutral'}
                  >
                    {u.role}
                  </Pill>
                </td>
                <td className="muted">
                  {u.role === 'admin'
                    ? 'tout'
                    : u.role === 'buyer'
                      ? 'un acheteur'
                      : u.sourceIds.map((id) => byId.get(id) ?? '?').join(', ') || '—'}
                </td>
                <td className="muted">{u.telegramChatId ? 'configuré' : '—'}</td>
                <td className="muted">{u.onDuty ? 'oui' : 'non'}</td>
                <td>{u.active ? <Pill tone="success">Actif</Pill> : <Pill>Inactif</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CreateStaffForm sources={sources.map((s) => ({ id: s.id, name: s.name }))} />
    </>
  );
}
