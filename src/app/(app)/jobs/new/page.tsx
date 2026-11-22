import { PageHeader } from "@/components/page";
import { getPeople, listClients } from "@/lib/data";
import { JobForm } from "../job-form";

export const metadata = { title: "New job" };

export default async function NewJobPage() {
  const [clients, people] = await Promise.all([listClients(), getPeople()]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="New job" intro="It gets a number as soon as it's quoted." />
      <JobForm clients={clients} people={people} />
    </div>
  );
}
