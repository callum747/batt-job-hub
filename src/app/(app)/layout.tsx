import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { currentPerson } from "@/lib/auth";
import { previewMode } from "@/lib/config";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const person = await currentPerson();
  if (!person) redirect("/login");
  return (
    <Shell person={previewMode ? { name: "Preview", email: "Not signed in" } : person} preview={previewMode}>
      {children}
    </Shell>
  );
}
