import { CalendarDays, Columns3, FileText, Home, Inbox, MessageCircle, Settings, Users, Wrench } from "lucide-react";

/** The menu, in the order a day runs: the work, then the office, then set-up. `phone` puts it on the bottom bar. */
export const NAV = [
  { href: "/", label: "Today", icon: Home, phone: true, group: "Work" },
  { href: "/jobs", label: "Jobs", icon: Wrench, phone: true, group: "Work" },
  { href: "/board", label: "Board", icon: Columns3, phone: false, group: "Work" },
  { href: "/diary", label: "Diary", icon: CalendarDays, phone: true, group: "Work" },
  { href: "/assistant", label: "Ask", icon: MessageCircle, phone: true, group: "Work" },
  { href: "/inbox", label: "Inbox", icon: Inbox, phone: false, group: "Office" },
  { href: "/invoices", label: "Invoices", icon: FileText, phone: false, group: "Office" },
  { href: "/clients", label: "Clients", icon: Users, phone: false, group: "Office" },
  { href: "/settings", label: "Settings", icon: Settings, phone: false, group: "Set-up" },
] as const;

export const NAV_GROUPS = ["Work", "Office", "Set-up"] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}
