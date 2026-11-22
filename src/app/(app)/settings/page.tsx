import { PageHeader } from "@/components/page";

export const metadata = { title: "Settings" };

const PEOPLE = [
  { name: "Cameron Batt", role: "Managing Director" },
  { name: "Callum Blacknell", role: "Project Manager" },
  { name: "Jed Stansfield", role: "Apprentice" },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" intro="People, rates and how the app behaves." />
      <section className="rounded-2xl border border-line">
        <h2 className="border-b border-line px-5 py-4 text-[18px] font-semibold">People</h2>
        <ul>
          {PEOPLE.map((p) => (
            <li key={p.name} className="flex items-center justify-between border-b border-line px-5 py-4 last:border-0">
              <span className="font-medium">{p.name}</span>
              <span className="text-muted">{p.role}</span>
            </li>
          ))}
        </ul>
      </section>
      <p className="mt-4 text-[15px] text-muted">Rates, day costs and margin colours are set up with the jobs in the next step.</p>
    </>
  );
}
