import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from 'react';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-white/80 bg-white/90 p-5 shadow-card backdrop-blur-sm', className)}>
      {children}
    </div>
  );
}

export function Button({
  href,
  children,
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  onClick,
  disabled
}: {
  href?: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: ButtonHTMLAttributes<HTMLButtonElement>['disabled'];
}) {
  const base = cn(
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/60 disabled:cursor-not-allowed disabled:opacity-50',
    size === 'sm' ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm',
    variant === 'primary' && 'bg-brand-navy text-white hover:bg-brand-navy/90',
    variant === 'secondary' && 'bg-brand-teal text-white hover:bg-brand-teal/90',
    variant === 'ghost' && 'border border-brand-navy/10 bg-white text-brand-navy hover:bg-brand-sand',
    variant === 'danger' && 'bg-status-missing text-white hover:bg-status-missing/90',
    className
  );

  if (href) {
    return (
      <Link className={base} href={href}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={base} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = 'neutral'
}: {
  children: ReactNode;
  tone?: 'neutral' | 'missing' | 'draft' | 'signed' | 'info';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
        tone === 'neutral' && 'bg-brand-navy/10 text-brand-navy',
        tone === 'missing' && 'bg-status-missing/15 text-status-missing',
        tone === 'draft' && 'bg-status-draft/15 text-status-draft',
        tone === 'signed' && 'bg-status-signed/15 text-status-signed',
        tone === 'info' && 'bg-brand-aqua/25 text-brand-navy'
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-brand-slate">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <Card className="text-center">
      <p className="font-semibold text-brand-navy">{title}</p>
      {body ? <p className="mt-1 text-sm text-brand-slate">{body}</p> : null}
    </Card>
  );
}

export function Alert({
  tone = 'info',
  title,
  children
}: {
  tone?: 'info' | 'warning' | 'error';
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cn(
        'rounded-xl border px-4 py-3 text-sm',
        tone === 'info' && 'border-brand-teal/30 bg-brand-aqua/15 text-brand-navy',
        tone === 'warning' && 'border-status-draft/30 bg-status-draft/10 text-status-draft',
        tone === 'error' && 'border-status-missing/30 bg-status-missing/10 text-status-missing'
      )}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? 'mt-1' : undefined}>{children}</div>
    </div>
  );
}
