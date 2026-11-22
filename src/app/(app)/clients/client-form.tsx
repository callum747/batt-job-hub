"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, inputCls, primaryBtn, textareaCls } from "@/components/ui";
import type { ClientRow } from "@/lib/data";
import { saveClient } from "../actions";
import { Toast } from "../jobs/job-controls";

export function ClientForm({ client }: { client?: ClientRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await saveClient(client?.id ?? null, f);
          if (r) setMsg(r.message);
          router.refresh();
        });
      }}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Name">
          <input name="name" required defaultValue={client?.name} className={inputCls} />
        </Field>
        <Field label="Type">
          <select name="type" defaultValue={client?.type ?? "Private"} className={inputCls}>
            {["Private", "Commercial", "Main contractor", "Landlord / agent"].concat(client?.type && !["Private", "Commercial", "Main contractor", "Landlord / agent"].includes(client.type) ? [client.type] : []).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Main contact">
          <input name="contact" defaultValue={client?.contact} className={inputCls} />
        </Field>
        <Field label="Payment terms (days)" hint="Leave empty to use the quote's terms">
          <input name="payment_days" inputMode="numeric" defaultValue={client?.payment_days ?? ""} className={inputCls} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={client?.email} className={inputCls} />
        </Field>
        <Field label="Phone">
          <input name="phone" type="tel" defaultValue={client?.phone} className={inputCls} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Billing address">
            <textarea name="billing_address" defaultValue={client?.billing_address} className={textareaCls} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Notes" hint="Rates, terms and how they like things done">
            <textarea name="notes" defaultValue={client?.notes} className={textareaCls} />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryBtn}>
          {pending ? "Saving…" : client ? "Save changes" : "Create client"}
        </button>
        <Toast message={msg} />
      </div>
    </form>
  );
}
