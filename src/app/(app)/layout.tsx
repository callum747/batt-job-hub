import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { currentPerson } from "@/lib/auth";
import { previewMode } from "@/lib/config";
import { gmailConnected, googleConnected } from "@/lib/google/client";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const person = await currentPerson();
  if (!person) redirect("/login");
  const googleNote = previewMode
    ? null
    : !(await googleConnected(person.email))
      ? "One more step: let the app use your Google Drive and Calendar."
      : !(await gmailConnected(person.email))
        ? "New: the app can now draft emails and show each job's emails. Connect Google again and tick the Gmail boxes."
        : null;
  return (
    <Shell person={previewMode ? { name: "Preview", email: "Not signed in" } : person} preview={previewMode} googleNote={googleNote}>
      {children}
    </Shell>
  );
}
