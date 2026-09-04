'use client';

import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import type { AuthenticatedUser } from '@/lib/auth';

const ROLE_LABELS: Record<AuthenticatedUser['role'], string> = {
  admin: 'Admin',
  setter: 'Setter',
  buyer: 'Acheteur',
};

export function UserCard({ user }: { user: AuthenticatedUser }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sidebar-user" style={{ position: 'relative' }}>
      <Avatar name={user.name} email={user.email} online={user.onDuty} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          className="sidebar-user-name"
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {user.name ?? user.email.split('@')[0]}
        </div>
        <div
          className="sidebar-user-sub"
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {ROLE_LABELS[user.role]}
          {user.onDuty ? ' · de garde' : ''}
        </div>
      </div>
      <button
        type="button"
        className="icon-btn"
        aria-label="Menu utilisateur"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal />
      </button>
      {open ? (
        <div
          className="card"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 48,
            width: 220,
            boxShadow: 'var(--shadow-md)',
            padding: 6,
            zIndex: 30,
          }}
        >
          <Link href="/utilisateurs/moi" className="sidebar-link" onClick={() => setOpen(false)}>
            Mes alertes
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="sidebar-link" style={{ width: '100%' }}>
              Se déconnecter
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
