import { Suspense } from 'react';
import LoginForm from './login-form';

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
      </div>
    </main>
  );
}
