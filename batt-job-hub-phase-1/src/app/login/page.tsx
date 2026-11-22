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
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-bg p-8 shadow-sm">
        <Image src="/brand/batt-horizontal-batt-colour.svg" alt="Batt" width={160} height={60} className="logo-light h-12 w-auto" priority />
        <Image src="/brand/batt-horizontal-batt-reversed.svg" alt="Batt" width={160} height={60} className="logo-dark h-12 w-auto" priority />
        <h1 className="mt-8 text-2xl font-semibold">Job Hub</h1>
        <p className="mt-1 text-muted">Sign in with your Batt Google account.</p>

        {message && (
          <p role="alert" className="mt-6 rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-[15px] text-bad">
            {message}
          </p>
        )}

        <div className="mt-8">
          {authConfigured ? (
            <GoogleButton />
          ) : (
            <p className="rounded-lg bg-surface px-4 py-3 text-[15px] text-muted">
              Sign-in isn&apos;t switched on yet. It needs the Google settings from the handover notes.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
