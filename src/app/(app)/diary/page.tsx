import { PageHeader } from "@/components/page";
import { getPeople, listJobs, listVisits } from "@/lib/data";
import { addDay } from "@/lib/google/format";
import { jobLabel, OPEN_STAGES, todayUK } from "@/lib/jobs-rules";
import { Planner } from "./planner";

export const metadata = { title: "Diary" };

/** The Monday of the week a date falls in. */
function mondayOf(iso: string) {
  const d = new Date(iso + "T12:00:00Z");
  return addDay(iso, -((d.getUTCDay() + 6) % 7));
}

export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const today = todayUK();
  const monday = mondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today);
  const days = Array.from({ length: 7 }, (_, i) => addDay(monday, i));
  const [visits, people, jobs] = await Promise.all([listVisits(days[0], days[6]), getPeople(true), listJobs()]);
  const options = jobs
    .filter((j) => OPEN_STAGES.includes(j.stage))
    .map((j) => ({ id: j.id, label: `${jobLabel(j)} ${j.client_name ?? "No client"}${j.site ? `, ${j.site}` : ""}`.slice(0, 80) }));

  return (
    <>
      <PageHeader title="Diary" intro="Who is where. Drag a visit to another person or day to move it." />
      <Planner days={days} today={today} visits={visits} people={people} jobs={options} prev={addDay(monday, -7)} next={addDay(monday, 7)} thisWeek={mondayOf(today)} />
    </>
  );
}
