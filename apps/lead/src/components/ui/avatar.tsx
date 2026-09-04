export function initialsOf(name: string | null, email: string): string {
  const base = (name?.trim() || email.split('@')[0] || '?').replace(/[._-]+/g, ' ');
  const parts = base.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function Avatar({
  name,
  email,
  online,
}: {
  name: string | null;
  email: string;
  online?: boolean;
}) {
  return <span className={`avatar${online ? ' online' : ''}`}>{initialsOf(name, email)}</span>;
}
