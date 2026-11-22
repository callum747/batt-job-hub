import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { currentPerson } from "@/lib/auth";
import { previewMode } from "@/lib/config";
import { googleConnected } from "@/lib/google/client";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const person = await currentPerson();
  if (!person) redirect("/login");
  const needsGoogle = previewMode ? false : !(await googleConnected(person.email));
  return (
    <Shell person={previewMode ? { name: "Preview", email: "Not signed in" } : person} preview={previewMode} needsGoogle={needsGoogle}>
      {children}
    </Shell>
  );
}
