import { currentPerson } from "@/lib/auth";
import { importDriveFolders } from "@/lib/google/drive-import";
import { dropQuoteVersions, followRenumbering } from "@/lib/google/drive-rename";

/** Called quietly by the app while someone has it open: job folders made by hand in Drive become jobs. */
export async function POST() {
  const me = await currentPerson();
  if (!me || me.email === "preview@localhost") return Response.json({ ran: false }, { status: me ? 200 : 401 });
  try {
    const out = await importDriveFolders(me.email);
    // Old "#557/3" quote names become plain "#557", a few at a time, until none are left.
    if (out.ran) await dropQuoteVersions(me.email).catch(() => 0);
    // A job whose number was corrected gets its folder and files renamed to match.
    if (out.ran) await followRenumbering(me.email).catch(() => 0);
    return Response.json(out);
  } catch (e) {
    return Response.json({ ran: true, message: e instanceof Error ? e.message : String(e) });
  }
}
