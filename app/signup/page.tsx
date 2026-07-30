import { loadBrand } from '@/lib/branding/load';
import { SignupForm } from '@/components/onboarding/signup-form';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const brand = await loadBrand();

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {brand.logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={brand.logoUrl} alt="" className="mx-auto mb-3 h-12 w-auto object-contain" />
          ) : null}
          <h1 className="text-xl font-semibold tracking-tight text-brand-navy">
            Set up your agency
          </h1>
          <p className="mt-1 text-sm text-brand-slate">
            Daily progress notes for your house, on Form #680.
          </p>
        </div>

        <SignupForm />
      </div>
    </main>
  );
}
