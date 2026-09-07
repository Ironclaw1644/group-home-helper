import { Suspense } from 'react';
import Link from 'next/link';
import LoginForm from './login-form';
import { DemoButton } from '@/components/onboarding/demo-button';
import { FlipLogo } from '@/components/brand/mark';

export const metadata = { title: 'Sign in · FlipBrief' };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* The product's mark, not a customer's. This page is reached before
              anyone is signed in, so there is no organization to theme it with
              — and it used to show one agency's logo to every other agency's
              staff. An agency's own logo belongs on their letterhead and
              inside their workspace. */}
          <FlipLogo className="justify-center" />
          <h1 className="mt-4 text-xl font-semibold text-brand-navy">Daily Progress Notes</h1>
          <p className="mt-1 text-sm text-brand-slate">Staff sign-in</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-brand-navy/10" />
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-slate">
            New here?
          </span>
          <span className="h-px flex-1 bg-brand-navy/10" />
        </div>

        <DemoButton />

        <p className="mt-6 text-center text-xs text-brand-slate">
          Staff joining an agency need an invitation link from their supervisor.
        </p>
        <p className="mt-2 text-center text-xs text-brand-slate">
          Running a group home?{' '}
          <Link href="/signup" className="font-semibold text-brand-teal hover:underline">
            Set up your own workspace
          </Link>
        </p>
      </div>
    </main>
  );
}
