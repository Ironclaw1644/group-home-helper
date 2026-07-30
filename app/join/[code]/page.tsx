import Link from 'next/link';
import { loadBrand } from '@/lib/branding/load';
import { validateInvite } from '@/lib/onboarding/provision';
import { JoinForm } from '@/components/onboarding/join-form';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Accept an invitation.
 *
 * Public: the person here has no account yet, which is the point. The code is
 * validated server-side before the form renders, so an expired or made-up link
 * never gets as far as showing an agency name.
 */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [brand, invite] = await Promise.all([loadBrand(), validateInvite(code)]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {brand.logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={brand.logoUrl} alt="" className="mx-auto mb-3 h-12 w-auto object-contain" />
          ) : null}
          <h1 className="text-xl font-semibold tracking-tight text-brand-navy">
            {invite ? 'Set up your account' : 'This link is not valid'}
          </h1>
        </div>

        {invite ? (
          <JoinForm code={code} invite={invite} />
        ) : (
          <Card>
            <p className="text-sm text-brand-navy">
              This invitation has expired, has already been used, or was never valid.
            </p>
            <p className="mt-2 text-sm text-brand-slate">
              Ask your supervisor to send a new one.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block text-sm font-semibold text-brand-teal hover:underline"
            >
              Already have an account? Sign in
            </Link>
          </Card>
        )}
      </div>
    </main>
  );
}
