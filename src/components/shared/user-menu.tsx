'use client';

import { LogOut } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { signOut } from '@/app/(auth)/actions';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  closer: 'Closer',
  closer_junior: 'Closer junior',
  executive: 'Direction',
};

function LogoutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label="Se déconnecter"
      title="Se déconnecter"
      disabled={pending}
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        background: 'transparent',
        border: '1px solid var(--border)',
        color: 'var(--text-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <LogOut size={14} />
    </button>
  );
}

export function UserMenu({
  name,
  role,
  initials,
}: {
  name: string;
  role: string;
  initials: string;
}) {
  return (
    <div className="view-sidebar-user">
      <div className="avatar avatar-sm avatar-blue avatar-status">{initials}</div>
      <div className="view-sidebar-user-info">
        <div className="view-sidebar-user-name">{name}</div>
        <div className="view-sidebar-user-role">{ROLE_LABELS[role] ?? role}</div>
      </div>
      <form action={signOut}>
        <LogoutButton />
      </form>
    </div>
  );
}
