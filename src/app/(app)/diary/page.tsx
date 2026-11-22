import { CalendarDays } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";

export const metadata = { title: "Diary" };

export default function DiaryPage() {
  return (
    <>
      <PageHeader title="Diary" intro="Who is where this week." />
      <EmptyState icon={CalendarDays} title="Nothing booked" text="Visits will show here as a week planner, one row per person, and go straight into the shared Google Calendar." />
    </>
  );
}
