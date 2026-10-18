import type { ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import type { User } from '../api';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="logo">
      <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="10" />
        <path d="M9 11h14M9 16h9M9 21h5" />
      </svg>
      {!compact && <span>Tasklane</span>}
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function Avatar({ user, size = 24 }: { user: Pick<User, 'name' | 'color'> | null | undefined; size?: number }) {
  if (!user) {
    return <span className="avatar avatar-empty" style={{ width: size, height: size }} title="Unassigned" />;
  }
  return (
    <span
      className="avatar"
      title={user.name}
      style={{ width: size, height: size, background: user.color, fontSize: Math.round(size * 0.4) }}
    >
      {initials(user.name)}
    </span>
  );
}

export function Select({
  icon,
  children,
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { icon?: ReactNode }) {
  return (
    <label className={`select ${className}`}>
      {icon}
      <select {...props}>{children}</select>
      <ChevronDown size={14} className="select-chevron" aria-hidden="true" />
    </label>
  );
}

/** Small ring showing how much of a column/project is complete. */
export function Ring({ value, total, color = 'var(--accent)', size = 18 }: { value: number; total: number; color?: string; size?: number }) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const pct = total ? value / total : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        className="ring-value"
      />
    </svg>
  );
}

export const PRIORITY_COLOR: Record<string, string> = {
  low: 'var(--prio-low)',
  medium: 'var(--prio-medium)',
  high: 'var(--prio-high)',
  urgent: 'var(--prio-urgent)',
};

export const STATUS_COLOR: Record<string, string> = {
  todo: 'var(--status-todo)',
  in_progress: 'var(--status-progress)',
  review: 'var(--status-review)',
  done: 'var(--accent)',
};
