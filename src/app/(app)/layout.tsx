import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail, previewMode } from "@/lib/config";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (previewMode) {
    return (
      <Shell person={{ name: "Preview", email: "Not signed in" }} preview>
        {children}
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAllowedEmail(user.email)) redirect("/login");

  const meta = user.user_metadata as { full_name?: string; name?: string };
  const name = meta.full_name || meta.name || user.email!.split("@")[0];

  return (
    <Shell person={{ name, email: user.email! }} preview={false}>
      {children}
    </Shell>
  );
}
