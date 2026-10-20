import type { ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import type { User } from '../api';

/**
 * "Live dot" wordmark: the tittle of the i is a status light.
 * `pulse` animates it while the real-time connection is up; `idle` greys it out while reconnecting.
 */
export function Logo({ pulse = false, idle = false }: { pulse?: boolean; idle?: boolean }) {
  return (
    <span className="logo" role="img" aria-label="Birge">
      <span className="logo-word" aria-hidden="true">
        b
        <span className="logo-i">
          ı<span className={`logo-dot${pulse ? ' pulse' : ''}${idle ? ' idle' : ''}`} />
        </span>
        rge
      </span>
    </span>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function Avatar({
  user,
  size = 24,
}: {
  user: (Pick<User, 'name' | 'color'> & { avatar?: string | null }) | null | undefined;
  size?: number;
}) {
  if (!user) {
    return <span className="avatar avatar-empty" style={{ width: size, height: size }} title="Unassigned" />;
  }
  if (user.avatar) {
    return (
      <img
        className="avatar avatar-photo"
        src={user.avatar}
        alt={user.name}
        title={user.name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        loading="lazy"
        decoding="async"
      />
    );
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
