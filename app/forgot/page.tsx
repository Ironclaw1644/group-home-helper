import { Suspense } from 'react';
import ForgotForm from './forgot-form';

export const metadata = { title: 'Reset your password' };

export default function ForgotPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-brand-navy">Reset your password</h1>
          <p className="mt-1 text-sm text-brand-slate">
            We will email you a link to set a new one.
          </p>
        </div>

        <Suspense fallback={null}>
          <ForgotForm />
        </Suspense>
      </div>
    </main>
  );
}
