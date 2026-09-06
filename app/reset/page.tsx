import { Suspense } from 'react';
import ResetForm from './reset-form';

export const metadata = { title: 'Set a new password' };

export default function ResetPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-brand-navy">Set a new password</h1>
          <p className="mt-1 text-sm text-brand-slate">Then you are back in.</p>
        </div>

        <Suspense fallback={null}>
          <ResetForm />
        </Suspense>
      </div>
    </main>
  );
}
