import { FileText } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";

export const metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return (
    <>
      <PageHeader title="Invoices" intro="Raised, sent, paid and overdue." />
      <EmptyState icon={FileText} title="No invoices yet" text="Invoices are made from your invoice template, numbered on from INV-545 and filed by VAT quarter." />
    </>
  );
}
