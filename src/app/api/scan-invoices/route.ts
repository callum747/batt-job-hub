import { currentPerson } from "@/lib/auth";
import { scanInvoices } from "@/lib/supplier-invoices";

/** Called quietly by the app while someone has it open. Runs a check at most every 30 minutes. */
export async function POST() {
  const me = await currentPerson();
  if (!me || me.email === "preview@localhost") return Response.json({ ran: false }, { status: me ? 200 : 401 });
  const r = await scanInvoices({ actor: me.email });
  return Response.json(r);
}
