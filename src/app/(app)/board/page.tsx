import { PageHeader } from "@/components/page";

export const metadata = { title: "Board" };

const STAGES = ["Enquiry", "Draft quote", "Quoted", "Booked", "In progress", "Complete", "Invoiced", "Paid"];

export default function BoardPage() {
  return (
    <>
      <PageHeader title="Board" intro="Drag a job to move it to the next stage." />
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
        {STAGES.map((s) => (
          <section key={s} className="w-72 shrink-0 rounded-2xl bg-surface p-4">
            <h2 className="flex items-center justify-between text-[16px] font-semibold">
              {s} <span className="text-[14px] font-medium text-muted">0</span>
            </h2>
            <p className="mt-4 rounded-xl border border-dashed border-line px-3 py-6 text-center text-[14px] text-muted">No jobs</p>
          </section>
        ))}
      </div>
    </>
  );
}
