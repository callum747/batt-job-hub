import { PageHeader } from "@/components/page";
import { getPeople, listJobs } from "@/lib/data";
import { BOARD_STAGES } from "@/lib/jobs-rules";
import { Board } from "./board";

export const metadata = { title: "Board" };

export default async function BoardPage() {
  const [jobs, people] = await Promise.all([listJobs(), getPeople(true)]);
  const open = jobs.filter((j) => BOARD_STAGES.includes(j.stage));
  return (
    <>
      <PageHeader title="Board" intro="Drag a job to another column to change its stage. On a phone, use the menu on each card." />
      <Board jobs={open} people={people} />
    </>
  );
}
