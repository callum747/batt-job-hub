import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { NAV } from "@/components/nav-items";
import { PageHeader } from "@/components/page";

export const metadata = { title: "More" };

export default function MorePage() {
  return (
    <>
      <PageHeader title="More" />
      <ul className="overflow-hidden rounded-2xl border border-line">
        {NAV.filter((n) => !n.phone).map(({ href, label, icon: Icon }) => (
          <li key={href} className="border-b border-line last:border-0">
            <Link href={href} className="flex h-16 items-center gap-4 px-5 text-[17px] font-medium hover:bg-surface">
              <Icon className="h-6 w-6 text-blue" aria-hidden="true" />
              {label}
              <ChevronRight className="ml-auto h-5 w-5 text-muted" aria-hidden="true" />
            </Link>
          </li>
        ))}
        <li>
          <form action="/auth/signout" method="post">
            <button type="submit" className="flex h-16 w-full items-center px-5 text-left text-[17px] font-medium text-muted hover:bg-surface">
              Sign out
            </button>
          </form>
        </li>
      </ul>
    </>
  );
}
