import type { ReactNode } from 'react';

export function PageHeader({
  title,
  count,
  sub,
  actions,
}: {
  title: string;
  count?: number | string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">
          {title}
          {count !== undefined ? <span className="page-count">{count}</span> : null}
        </h1>
        {sub ? <p className="page-sub">{sub}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}
