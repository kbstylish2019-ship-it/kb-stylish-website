import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

/**
 * Public mobile-first landing page behind the salon QR posters:
 * https://www.kbstylish.com.np/join/JADIBUTI
 * Tries to open the app via deep link; otherwise shows install steps + the human code.
 * kb_branches is public-read, so a plain anon client works (no cookies needed).
 */

export const metadata = {
  title: 'Claim your free stamp | KB Stylish',
};

export default async function JoinLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode || '').toUpperCase();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: branch } = await supabase
    .from('kb_branches')
    .select('name, referral_code')
    .ilike('referral_code', code)
    .eq('is_active', true)
    .maybeSingle();

  const branchLabel = branch?.name?.replace('KB Stylish_', 'KB Stylish ');
  const deepLink = `kbstylish://join/${code}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center px-6 py-12 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-[#1976D2]">
        KB Stylish Rewards
      </p>
      {branch ? (
        <>
          <h1 className="mt-2 text-3xl font-extrabold text-neutral-900">
            Welcome from {branchLabel}! 💈
          </h1>
          <p className="mt-3 text-neutral-600">
            Your <b>first loyalty stamp is free</b> — your stamp card starts at 1/5.
            Collect 5 stamps and your next booking is completely free.
          </p>

          <div className="mt-8 w-full space-y-3">
            <a
              href={deepLink}
              className="block w-full rounded-full bg-[#1976D2] px-6 py-3 font-semibold text-white"
              data-testid="open-app-link"
            >
              I have the app — claim my stamp
            </a>
            <div className="rounded-2xl border border-neutral-200 p-5 text-left">
              <p className="text-sm font-semibold text-neutral-900">New here? 3 quick steps:</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-neutral-600">
                <li>Install the KB Stylish app (coming soon to Play Store &amp; App Store — ask our staff for the install link)</li>
                <li>Create your account</li>
                <li>
                  In <b>Profile → Rewards</b>, enter salon code:
                </li>
              </ol>
              <p className="mt-3 text-center text-3xl font-black tracking-widest text-neutral-900">
                {code}
              </p>
            </div>
          </div>
        </>
      ) : (
        <>
          <h1 className="mt-2 text-2xl font-extrabold text-neutral-900">
            Hmm, that code isn&apos;t right
          </h1>
          <p className="mt-3 text-neutral-600">
            We couldn&apos;t find a salon for the code <b>{code || '—'}</b>. Please check the
            poster, or ask our staff for help.
          </p>
        </>
      )}
      <Link href="/" className="mt-10 text-sm text-neutral-400 underline">
        kbstylish.com.np
      </Link>
    </main>
  );
}
