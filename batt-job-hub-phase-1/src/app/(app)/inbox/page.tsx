import { Inbox } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";

export const metadata = { title: "Inbox" };

export default function InboxPage() {
  return (
    <>
      <PageHeader title="Inbox" intro="New enquiries and emails that aren't on a job yet." />
      <EmptyState icon={Inbox} title="Nothing to sort" text="Enquiry emails will land here, ready to turn into a job and a quote." />
    </>
  );
}
