import { Inbox } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { ConnectGoogleButton } from "@/components/connect-google";
import { secondaryBtn } from "@/components/ui";
import { currentPerson } from "@/lib/auth";
import { errorText, gmailConnected } from "@/lib/google/client";
import { listInbox, type InboxItem } from "@/lib/inbox";
import { assistantConfigured } from "@/lib/assistant/client";
import { InboxList } from "./inbox-list";

export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const me = await currentPerson();
  const ok = me && me.email !== "preview@localhost" ? await gmailConnected(me.email) : false;
  let items: InboxItem[] = [];
  let problem = "";
  if (ok) {
    try {
      items = await listInbox(me!.email);
    } catch (e) {
      problem = errorText(e);
    }
  }
  return (
    <>
      <PageHeader title="Inbox" intro="Emails from the last 30 days in your inbox that aren't on a job yet. Make a job from one, add it to a job, or clear it." />
      {!ok ? (
        <div className="rounded-2xl border border-line p-5">
          <p className="mb-3">Connect Google and tick the Gmail boxes to see your emails here. The app reads your inbox; it never sends or deletes.</p>
          <ConnectGoogleButton className={secondaryBtn}>Connect Google</ConnectGoogleButton>
        </div>
      ) : problem ? (
        <p className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3">{problem}</p>
      ) : items.length === 0 ? (
        <EmptyState icon={Inbox} title="Nothing to sort" text="Every recent email from outside Batt is on a job or has been cleared." />
      ) : (
        <InboxList items={items} ai={assistantConfigured()} />
      )}
    </>
  );
}
