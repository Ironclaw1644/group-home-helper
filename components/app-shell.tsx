import Link from 'next/link';
import { IdCard, LayoutGrid, LogOut, Users } from 'lucide-react';
import type { Session } from '@/lib/auth/session';
import { isSupervisor } from '@/lib/auth/session';
import { loadBrand } from '@/lib/branding/load';

export async function AppShell({
  session,
  children
}: {
  session: Session;
  children: React.ReactNode;
}) {
  const brand = await loadBrand();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-brand-navy/10 bg-white/90 backdrop-blur">
        <div className="container-shell flex h-14 items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2">
            {brand.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={brand.logoUrl} alt="" className="h-7 w-auto object-contain" />
            ) : null}
            <span className="text-sm font-semibold text-brand-navy">Daily Notes</span>
          </Link>

          <div className="flex items-center gap-3">
            {/* DSPs get this too — looking up who is in the house is a normal
                part of a shift, and RLS already limits it to their homes. */}
            <Link
              href="/residents"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-brand-navy"
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Residents</span>
            </Link>

            {isSupervisor(session.profile) ? (
              <Link
                href="/staff"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-brand-navy"
              >
                <IdCard className="h-4 w-4" />
                <span className="hidden sm:inline">Staff</span>
              </Link>
            ) : null}

            {isSupervisor(session.profile) ? (
              <Link
                href="/supervisor"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-brand-navy"
              >
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline">Supervisor</span>
              </Link>
            ) : null}

            <span className="hidden text-xs text-brand-slate sm:inline">
              {session.profile.fullName} · {session.profile.title}
            </span>

            <form action="/api/auth/sign-out" method="post">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-brand-navy"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="container-shell py-6">{children}</main>
    </div>
  );
}
