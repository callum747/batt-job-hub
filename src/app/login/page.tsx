import Image from "next/image";
import { authConfigured, ALLOWED_DOMAIN } from "@/lib/config";
import { GoogleButton } from "./google-button";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  domain: `Only Batt Google accounts (@${ALLOWED_DOMAIN}) can sign in. Choose your Batt account and try again.`,
  failed: "Sign-in didn't finish. Please try again.",
  AccessDenied: `Only Batt Google accounts (@${ALLOWED_DOMAIN}) can sign in.`,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? ERRORS[error] ?? ERRORS.failed : null;

  return (
    <main className="relative flex min-h-dvh bg-page">
      {/* Brand artwork: the property city on the right, fading out before the words (brand guide, section 6). */}
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[58%] md:block" aria-hidden="true">
        <Image src="/brand/property-city-white.jpg" alt="" fill priority sizes="58vw" className="object-cover object-center" />
        <div className="absolute inset-y-0 left-0 w-[45%] bg-gradient-to-r from-page to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-page to-transparent" />
      </div>

      <div className="relative flex w-full flex-col justify-between px-6 py-8 md:w-[46%] md:px-14 md:py-12">
        <Image src="/brand/batt-horizontal-batt-colour.svg" alt="Batt" width={160} height={60} className="h-10 w-auto self-start" priority />

        <div className="my-12 max-w-sm">
          <p className="label">Job Hub</p>
          <h1 className="headline mt-3 text-[26px] md:text-[34px]">
            Powering profitable <span className="block text-blue">property</span>
          </h1>
          <p className="mt-4 text-[16px] text-muted">Jobs, quotes, visits and invoices in one place. Sign in with your Batt Google account.</p>

          {message && (
            <p role="alert" className="mt-6 rounded-[10px] border border-bad/30 bg-bad/10 px-4 py-3 text-[15px]">
              {message}
            </p>
          )}

          <div className="mt-8">
            {authConfigured ? (
              <GoogleButton />
            ) : (
              <p className="rounded-[10px] border border-line bg-bg px-4 py-3 text-[15px] text-muted">
                Sign-in isn&apos;t switched on yet. It needs the Google settings from the handover notes.
              </p>
            )}
          </div>
        </div>

        <p className="label !tracking-[0.14em]">Buckinghamshire | London | South East</p>
      </div>
    </main>
  );
}
