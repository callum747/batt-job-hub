import { Users } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";

export const metadata = { title: "Clients" };

export default function ClientsPage() {
  return (
    <>
      <PageHeader title="Clients" intro="Who we work for, their terms and their jobs." />
      <EmptyState icon={Users} title="No clients yet" text="All 11 clients from the current app are brought in next." />
    </>
  );
}
