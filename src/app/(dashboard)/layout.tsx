import type { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 border-r border-border bg-card">
        <div className="p-4 font-semibold">THE PILOT</div>
        <nav className="flex flex-col gap-1 px-2">
          <a href="/closing/pipeline" className="px-3 py-2 rounded hover:bg-muted">
            Closing
          </a>
          <a href="/email/flows" className="px-3 py-2 rounded hover:bg-muted">
            Email
          </a>
          <a href="/social" className="px-3 py-2 rounded hover:bg-muted">
            Social
          </a>
          <a href="/ads" className="px-3 py-2 rounded hover:bg-muted">
            Ads
          </a>
          <a href="/performance" className="px-3 py-2 rounded hover:bg-muted">
            Performance
          </a>
          <a href="/settings" className="px-3 py-2 rounded hover:bg-muted">
            Settings
          </a>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
