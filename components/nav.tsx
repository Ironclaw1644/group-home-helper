'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  CreditCard,
  FileBarChart,
  IdCard,
  LayoutGrid,
  Users
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Primary navigation.
 *
 * Two renderings of one list: a sidebar on desktop and a bottom tab bar on
 * phones. The bar is at the bottom because DSPs work one-handed on a phone
 * mid-shift, and the top of a large screen is the hardest place to reach.
 *
 * Everything a person can do is named here. The app grew to a dozen screens
 * behind four header links, which meant the features worth paying for —
 * service plans, progress, quarterly reviews — were only findable by someone
 * who already knew they existed.
 */

export type NavRole = 'dsp' | 'supervisor' | 'admin';

type Item = {
  href: string;
  label: string;
  icon: typeof CalendarDays;
  /** Supervisors and admins only. */
  supervisorOnly?: boolean;
  /** Shown in the phone tab bar. Five is the most that fits legibly. */
  onMobile?: boolean;
};

const ITEMS: Item[] = [
  { href: '/', label: 'Today', icon: CalendarDays, onMobile: true },
  { href: '/residents', label: 'Residents', icon: Users, onMobile: true },
  { href: '/reports', label: 'Reports', icon: FileBarChart, onMobile: true },
  { href: '/supervisor', label: 'Oversight', icon: LayoutGrid, supervisorOnly: true, onMobile: true },
  { href: '/staff', label: 'Staff', icon: IdCard, supervisorOnly: true },
  { href: '/billing', label: 'Billing', icon: CreditCard, supervisorOnly: true }
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
}

export function Sidebar({ role }: { role: NavRole }) {
  const isActive = useIsActive();
  const items = ITEMS.filter((i) => !i.supervisorOnly || role !== 'dsp');

  return (
    <nav aria-label="Main" className="hidden lg:block">
      <ul className="space-y-1">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                  active
                    ? 'bg-brand-navy text-white'
                    : 'text-brand-slate hover:bg-brand-sand hover:text-brand-navy'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileTabs({ role }: { role: NavRole }) {
  const isActive = useIsActive();
  const items = ITEMS.filter((i) => i.onMobile && (!i.supervisorOnly || role !== 'dsp'));

  return (
    <nav
      aria-label="Main"
      // pb-safe keeps the bar clear of the iPhone home indicator, which
      // otherwise sits on top of the last tab.
      className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-navy/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="flex">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition',
                  active ? 'text-brand-navy' : 'text-brand-slate'
                )}
              >
                <item.icon className={cn('h-5 w-5', active && 'text-brand-teal')} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
