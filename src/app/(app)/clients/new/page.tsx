import { PageHeader } from "@/components/page";
import { ClientForm } from "../client-form";

export const metadata = { title: "New client" };

export default function NewClientPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="New client" />
      <ClientForm />
    </div>
  );
}
