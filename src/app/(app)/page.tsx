import { CalendarDays, Wrench } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";

export const metadata = { title: "Today" };

function today() {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date());
}

export default function TodayPage() {
  return (
    <>
      <PageHeader title="Today" intro={today()} />
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {[
          ["Live quotes", "–"],
          ["Jobs on", "–"],
          ["Owed to us", "–"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line p-3 md:p-5">
            <p className="text-[14px] leading-tight text-muted md:text-[15px]">{label}</p>
            <p className="mt-1 text-[26px] font-semibold md:text-[32px]">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <EmptyState icon={CalendarDays} title="No visits today" text="Visits booked in the diary will show here, with who is going where." />
        <EmptyState icon={Wrench} title="No jobs yet" text="Your jobs and clients are brought in from the current app in the next step." />
      </div>
    </>
  );
}
