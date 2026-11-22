import "server-only";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { ALLOWED_DOMAIN, isAllowedEmail, previewMode } from "./config";
import { GOOGLE_SCOPES, saveRefreshToken } from "./google/client";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // Ask Google to show only Batt accounts. The sign-in callback checks again.
      // Drive and Calendar permission is asked for once; "offline" lets the app keep working between visits.
      authorization: { params: { hd: ALLOWED_DOMAIN, prompt: "select_account", access_type: "offline", scope: GOOGLE_SCOPES.join(" ") } },
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ profile }) {
      const p = profile as { email?: string; email_verified?: boolean; hd?: string } | undefined;
      if (!p?.email || p.email_verified === false) return "/login?error=domain";
      if (!isAllowedEmail(p.email) || (p.hd ?? "").toLowerCase() !== ALLOWED_DOMAIN) return "/login?error=domain";
      return true;
    },
    async jwt({ token, account, profile }) {
      // Google only hands over the long-lived permission the first time, or when asked to connect again.
      const email = (profile as { email?: string } | undefined)?.email;
      if (account?.refresh_token && email && isAllowedEmail(email)) {
        await saveRefreshToken(email, account.refresh_token, account.scope ?? "");
      }
      return token;
    },
  },
};

export type Person = { name: string; email: string };

/** The signed-in person, or a stand-in during local preview. Null means not signed in. */
export async function currentPerson(): Promise<Person | null> {
  if (previewMode) return { name: "Preview", email: "preview@localhost" };
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email || !isAllowedEmail(email)) return null;
  return { name: session.user?.name || email.split("@")[0], email };
}
