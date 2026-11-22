import { Wrench } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";

export const metadata = { title: "Jobs" };

export default function JobsPage() {
  return (
    <>
      <PageHeader title="Jobs" intro="Every enquiry, quote and job, by number." />
      <EmptyState icon={Wrench} title="No jobs yet" text="All 49 jobs from the current app are brought in next. New jobs get the next number automatically." />
    </>
  );
}
