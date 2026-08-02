import Link from 'next/link';
import { LogOut } from 'lucide-react';
import type { Session } from '@/lib/auth/session';
import { loadBrand } from '@/lib/branding/load';
import { MobileTabs, Sidebar } from '@/components/nav';

/**
 * App chrome: sidebar on desktop, bottom tab bar on phones.
 *
 * The header used to carry the whole of navigation as four small links, which
 * hid most of the app from anyone who had not been shown it. Navigation now
 * lives in one place and names everything a person can do.
 */
export async function AppShell({
  session,
  children
}: {
  session: Session;
  children: React.ReactNode;
}) {
  const brand = await loadBrand();
  const role = session.profile.role;

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

      <div className="container-shell lg:flex lg:gap-8">
        <aside className="hidden shrink-0 py-6 lg:block lg:w-52">
          <div className="sticky top-20">
            <Sidebar role={role} />
          </div>
        </aside>

        {/* pb-24 on phones keeps the last card clear of the tab bar. */}
        <main className="min-w-0 flex-1 pb-24 pt-6 lg:pb-10">{children}</main>
      </div>

      <MobileTabs role={role} />
    </div>
  );
}
