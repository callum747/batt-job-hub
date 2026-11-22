import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page";
import { ButtonLink } from "@/components/ui";
import { getPeople, listJobs } from "@/lib/data";
import { JobsList } from "./jobs-list";

export const metadata = { title: "Jobs" };

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const [{ show }, jobs, people] = await Promise.all([searchParams, listJobs(), getPeople(true)]);
  return (
    <>
      <PageHeader
        title="Jobs"
        intro="Every enquiry, quote and job, by number."
        action={
          <ButtonLink href="/jobs/new" primary>
            <Plus className="h-5 w-5" aria-hidden="true" /> New job
          </ButtonLink>
        }
      />
      <JobsList jobs={jobs} people={people} show={show ?? "open"} />
    </>
  );
}
