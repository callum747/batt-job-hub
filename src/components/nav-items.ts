import { CalendarDays, Columns3, FileText, Home, Inbox, MessageCircle, Settings, Users, Wrench } from "lucide-react";

export const NAV = [
  { href: "/", label: "Today", icon: Home, phone: true },
  { href: "/jobs", label: "Jobs", icon: Wrench, phone: true },
  { href: "/board", label: "Board", icon: Columns3, phone: false },
  { href: "/diary", label: "Diary", icon: CalendarDays, phone: true },
  { href: "/assistant", label: "Ask", icon: MessageCircle, phone: true },
  { href: "/clients", label: "Clients", icon: Users, phone: false },
  { href: "/inbox", label: "Inbox", icon: Inbox, phone: false },
  { href: "/invoices", label: "Invoices", icon: FileText, phone: false },
  { href: "/settings", label: "Settings", icon: Settings, phone: false },
] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}
