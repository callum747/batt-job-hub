import { PageHeader } from "@/components/page";
import { Card } from "@/components/ui";
import { getPeople, getSettings } from "@/lib/data";
import { gbp } from "@/lib/money";
import { MarginsForm, PersonForm } from "./forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [people, settings] = await Promise.all([getPeople(true), getSettings()]);
  const r = settings.rates;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Settings" intro="People, day costs and how the profit light works." />
      <Card title="People">
        <p className="mb-4 text-[15px] text-muted">
          Day cost is what a day on site costs Batt for that person, at full cost with van, tools and overheads, worked out from the Labour Cost Rates sheet. It&apos;s used for profit, not for pricing.
        </p>
        <div className="space-y-6">
          {people.map((p) => (
            <PersonForm key={p.id} person={p} />
          ))}
        </div>
      </Card>
      <Card title="Profit light">
        <MarginsForm green={settings.margins.green} red={settings.margins.red} />
      </Card>
      <Card title="Charge-out rates">
        <dl className="grid gap-3 text-[15px] sm:grid-cols-2">
          {[
            ["Electrician (pricing sheet)", `${gbp(r.electricianDay)} a day`],
            ["Apprentice (pricing sheet)", `${gbp(r.apprenticeDay)} a day`],
            ["Day-rate clients, electrician", `${gbp(r.dayRate)} a day`],
            ["Day-rate clients, trainee apprentice", `${gbp(r.apprenticeDayRate)} a day`],
            ["Survey", `${gbp(r.surveyDay)} a day`],
            ["Mileage", `${Math.round(r.perMile * 100)}p a mile`],
            ["Materials markup", `${r.markupPct}%`],
            ["VAT", `${r.vatPct}%`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 rounded-xl bg-surface px-4 py-3">
              <dt className="text-muted">{k}</dt>
              <dd className="font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[14px] text-muted">From the playbook. These are used for quoting from the next steps onwards.</p>
      </Card>
    </div>
  );
}
