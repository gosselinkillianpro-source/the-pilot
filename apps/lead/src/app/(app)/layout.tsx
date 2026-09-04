import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { MobileNav } from '@/components/shell/mobile-nav';
import { Sidebar } from '@/components/shell/sidebar';
import { ToastProvider } from '@/components/ui/toast';
import { AuthError, getAuthenticatedUser } from '@/lib/auth';
import { isAuthDisabled } from '@/lib/auth/dev-bypass';
import { isWithinServiceHours } from '@/lib/domain/time';
import { countLeadsByState, listSourcesForUser } from '@/lib/leads/queries';

export const dynamic = 'force-dynamic';

/** Coque des écrans internes (admin, setter). Un acheteur est renvoyé vers son espace. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof AuthError) redirect('/login');
    throw e;
  }
  if (user.role === 'buyer') redirect('/acheteur');

  const [sources, counts] = await Promise.all([listSourcesForUser(user), countLeadsByState(user)]);
  const first = sources[0];
  const sourceName =
    sources.length === 1 && first
      ? first.name
      : sources.length > 1
        ? `${sources.length} sources`
        : 'Aucune source';
  const serviceOpen = first
    ? isWithinServiceHours(new Date(), first.serviceHours, first.defaultTimezone)
    : false;
  const queueCount = counts.a_rappeler ?? 0;

  return (
    <ToastProvider>
      <div className="app-shell">
        <Sidebar user={user} sourceName={sourceName} queueCount={queueCount} />
        <div className="main">
          {isAuthDisabled() ? (
            <div
              style={{
                background: 'var(--danger)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'center',
                padding: '6px 12px',
              }}
            >
              🔓 Authentification DÉSACTIVÉE (dev local) — retirer DISABLE_AUTH avant la mise en
              ligne
            </div>
          ) : null}
          <header className="topbar">
            <MobileNav>
              <Sidebar
                user={user}
                sourceName={sourceName}
                queueCount={queueCount}
                className="open"
              />
            </MobileNav>
            <div
              className="row"
              style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--text-3)' }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: serviceOpen ? 'var(--success)' : 'var(--text-4)',
                  boxShadow: serviceOpen ? '0 0 6px var(--success)' : 'none',
                }}
              />
              {first
                ? serviceOpen
                  ? 'Service ouvert'
                  : 'Hors heures de service'
                : 'Aucune source configurée'}
            </div>
          </header>
          <main className="content">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
