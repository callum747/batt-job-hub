import { PageHeader } from "@/components/page";
import { Card } from "@/components/ui";
import { getPeople, getSettings } from "@/lib/data";
import { gbp } from "@/lib/money";
import { FuelForm, MarginsForm, PersonForm } from "./forms";
import { GoogleSettings } from "./google";
import { currentPerson } from "@/lib/auth";
import { previewMode } from "@/lib/config";
import { googleConnected, googleSettings } from "@/lib/google/client";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [people, settings, me, google] = await Promise.all([getPeople(true), getSettings(), currentPerson(), googleSettings()]);
  const connected = me ? await googleConnected(me.email) : false;
  const r = settings.rates;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Settings" intro="People, day costs and how the profit light works." />
      <Card title="Google Drive and Calendar">
        <GoogleSettings connected={connected} mode={google.mode} preview={previewMode} />
      </Card>
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
      <Card title="Fuel cost for job profit">
        <p className="mb-4 text-[15px] text-muted">
          Quotes charge {Math.round(r.perMile * 100)}p a mile, which also covers wear and tear. For a job&apos;s profit only the fuel counts, so put in what the vans really do to the gallon and what fuel costs. It never changes a quote.
        </p>
        <FuelForm mpg={settings.fuel.mpg} pencePerLitre={settings.fuel.pencePerLitre} quoted={r.perMile} />
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
