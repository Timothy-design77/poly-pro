import type { ReactNode } from 'react';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return <header className="page-header"><h1 className="page-heading">{title}</h1>{children}</header>;
}
