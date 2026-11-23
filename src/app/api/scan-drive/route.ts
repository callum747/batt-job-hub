import { currentPerson } from "@/lib/auth";
import { importDriveFolders } from "@/lib/google/drive-import";

/** Called quietly by the app while someone has it open: job folders made by hand in Drive become jobs. */
export async function POST() {
  const me = await currentPerson();
  if (!me || me.email === "preview@localhost") return Response.json({ ran: false }, { status: me ? 200 : 401 });
  try {
    return Response.json(await importDriveFolders(me.email));
  } catch (e) {
    return Response.json({ ran: true, message: e instanceof Error ? e.message : String(e) });
  }
}
