import { Suspense } from 'react';
import Link from 'next/link';
import LoginForm from './login-form';
import { DemoButton } from '@/components/onboarding/demo-button';

export const metadata = { title: 'Sign in · AHFS Notes' };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/AHFS_logo.png"
            alt="At Home Family Services"
            className="mx-auto h-16 w-auto object-contain"
          />
          <h1 className="mt-4 text-xl font-semibold text-brand-navy">Daily Progress Notes</h1>
          <p className="mt-1 text-sm text-brand-slate">Staff sign-in</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-brand-navy/10" />
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-slate">or</span>
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
